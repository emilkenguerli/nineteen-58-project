-- ============================================================================
-- Marketing Campaigns Reporting Database
-- seed.sql — tables, indexes, RLS, RPC functions, and deterministic seed data
-- ============================================================================

-- Enable pgcrypto just in case (Supabase has it, but be safe)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    status     TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed')),
    budget     NUMERIC(12, 2) NOT NULL,
    start_date DATE NOT NULL,
    end_date   DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Channels
CREATE TABLE IF NOT EXISTS channels (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('social', 'search', 'display', 'email', 'video')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily Metrics
CREATE TABLE IF NOT EXISTS daily_metrics (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    channel_id  UUID NOT NULL REFERENCES channels  (id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks      INTEGER NOT NULL DEFAULT 0,
    conversions INTEGER NOT NULL DEFAULT 0,
    spend       NUMERIC(10, 2) NOT NULL DEFAULT 0,
    revenue     NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, channel_id, date)
);

-- Reports (persistence stretch goal)
CREATE TABLE IF NOT EXISTS reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt      TEXT NOT NULL,
    report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_daily_metrics_campaign_id ON daily_metrics (campaign_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_channel_id  ON daily_metrics (channel_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date        ON daily_metrics (date);
CREATE INDEX IF NOT EXISTS idx_campaigns_status          ON campaigns (status);

-- ============================================================================
-- 3. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE campaigns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports       ENABLE ROW LEVEL SECURITY;

-- SELECT policies for the authenticated role
CREATE POLICY "Authenticated users can read campaigns"
    ON campaigns FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read channels"
    ON channels FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read daily_metrics"
    ON daily_metrics FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read reports"
    ON reports FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert reports (for the persistence stretch goal)
CREATE POLICY "Authenticated users can insert reports"
    ON reports FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- 4. RPC FUNCTIONS
-- ============================================================================

-- a) list_campaigns
CREATE OR REPLACE FUNCTION list_campaigns(
    p_status     TEXT DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date   DATE DEFAULT NULL
)
RETURNS SETOF campaigns
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT *
    FROM   campaigns
    WHERE  (p_status IS NULL     OR status     = p_status)
      AND  (p_start_date IS NULL OR start_date >= p_start_date)
      AND  (p_end_date IS NULL   OR end_date   <= p_end_date)
    ORDER BY start_date DESC;
$$;

-- b) list_channels
CREATE OR REPLACE FUNCTION list_channels(
    p_type TEXT DEFAULT NULL
)
RETURNS SETOF channels
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT *
    FROM   channels
    WHERE  (p_type IS NULL OR type = p_type)
    ORDER BY name;
$$;

-- c) get_metrics
CREATE OR REPLACE FUNCTION get_metrics(
    p_campaign_id UUID DEFAULT NULL,
    p_channel_id  UUID DEFAULT NULL,
    p_start_date  DATE DEFAULT NULL,
    p_end_date    DATE DEFAULT NULL,
    p_group_by    TEXT DEFAULT 'campaign'
)
RETURNS TABLE (
    group_name       TEXT,
    total_impressions BIGINT,
    total_clicks      BIGINT,
    total_conversions BIGINT,
    total_spend       NUMERIC,
    total_revenue     NUMERIC,
    ctr               NUMERIC,
    conversion_rate   NUMERIC,
    roas              NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE
            WHEN p_group_by = 'channel' THEN ch.name
            WHEN p_group_by = 'both'    THEN (c.name || ' / ' || ch.name)
            ELSE c.name  -- default: group by campaign
        END                                                    AS group_name,
        SUM(dm.impressions)::BIGINT                            AS total_impressions,
        SUM(dm.clicks)::BIGINT                                 AS total_clicks,
        SUM(dm.conversions)::BIGINT                            AS total_conversions,
        SUM(dm.spend)                                          AS total_spend,
        SUM(dm.revenue)                                        AS total_revenue,
        CASE WHEN SUM(dm.impressions) > 0
            THEN ROUND(SUM(dm.clicks)::NUMERIC / SUM(dm.impressions) * 100, 2)
            ELSE 0 END                                         AS ctr,
        CASE WHEN SUM(dm.clicks) > 0
            THEN ROUND(SUM(dm.conversions)::NUMERIC / SUM(dm.clicks) * 100, 2)
            ELSE 0 END                                         AS conversion_rate,
        CASE WHEN SUM(dm.spend) > 0
            THEN ROUND(SUM(dm.revenue) / SUM(dm.spend), 2)
            ELSE 0 END                                         AS roas
    FROM daily_metrics dm
    JOIN campaigns c  ON c.id  = dm.campaign_id
    JOIN channels  ch ON ch.id = dm.channel_id
    WHERE (p_campaign_id IS NULL OR dm.campaign_id = p_campaign_id)
      AND (p_channel_id  IS NULL OR dm.channel_id  = p_channel_id)
      AND (p_start_date  IS NULL OR dm.date        >= p_start_date)
      AND (p_end_date    IS NULL OR dm.date        <= p_end_date)
    GROUP BY
        CASE
            WHEN p_group_by = 'channel' THEN ch.name
            WHEN p_group_by = 'both'    THEN (c.name || ' / ' || ch.name)
            ELSE c.name
        END
    ORDER BY total_revenue DESC;
END;
$$;

-- d) get_timeseries
CREATE OR REPLACE FUNCTION get_timeseries(
    p_campaign_id UUID DEFAULT NULL,
    p_channel_id  UUID DEFAULT NULL,
    p_start_date  DATE DEFAULT NULL,
    p_end_date    DATE DEFAULT NULL,
    p_metric      TEXT DEFAULT 'revenue'
)
RETURNS TABLE (
    date  DATE,
    value NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Whitelist: only allow known metric columns
    IF p_metric NOT IN ('impressions', 'clicks', 'conversions', 'spend', 'revenue') THEN
        RAISE EXCEPTION 'Invalid metric: %. Allowed values: impressions, clicks, conversions, spend, revenue', p_metric;
    END IF;

    RETURN QUERY
    SELECT
        dm.date,
        CASE p_metric
            WHEN 'impressions'  THEN SUM(dm.impressions)::NUMERIC
            WHEN 'clicks'       THEN SUM(dm.clicks)::NUMERIC
            WHEN 'conversions'  THEN SUM(dm.conversions)::NUMERIC
            WHEN 'spend'        THEN SUM(dm.spend)::NUMERIC
            WHEN 'revenue'      THEN SUM(dm.revenue)::NUMERIC
        END AS value
    FROM daily_metrics dm
    WHERE (p_campaign_id IS NULL OR dm.campaign_id = p_campaign_id)
      AND (p_channel_id  IS NULL OR dm.channel_id  = p_channel_id)
      AND (p_start_date  IS NULL OR dm.date        >= p_start_date)
      AND (p_end_date    IS NULL OR dm.date        <= p_end_date)
    GROUP BY dm.date
    ORDER BY dm.date;
END;
$$;

-- ============================================================================
-- 5. SEED DATA
-- ============================================================================

-- Fixed campaign UUIDs
INSERT INTO campaigns (id, name, status, budget, start_date, end_date) VALUES
    ('a1111111-1111-1111-1111-111111111111', 'Spring Sale 2025',      'active',    15000.00, CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE + INTERVAL '17 days'),
    ('a2222222-2222-2222-2222-222222222222', 'Brand Awareness Q1',    'active',    25000.00, CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE + INTERVAL '48 days'),
    ('a3333333-3333-3333-3333-333333333333', 'Product Launch Beta',   'active',     8000.00, CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE + INTERVAL '7 days'),
    ('a4444444-4444-4444-4444-444444444444', 'Holiday Campaign 2024', 'completed', 50000.00, CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE - INTERVAL '1 day'),
    ('a5555555-5555-5555-5555-555555555555', 'Retargeting Push',      'paused',    12000.00, CURRENT_DATE - INTERVAL '13 days', NULL);

-- Fixed channel UUIDs
INSERT INTO channels (id, name, type) VALUES
    ('b1111111-1111-1111-1111-111111111111', 'Google Ads',        'search'),
    ('b2222222-2222-2222-2222-222222222222', 'Facebook',          'social'),
    ('b3333333-3333-3333-3333-333333333333', 'Instagram',         'social'),
    ('b4444444-4444-4444-4444-444444444444', 'Email Newsletter',  'email'),
    ('b5555555-5555-5555-5555-555555555555', 'YouTube',           'video');

-- ---------------------------------------------------------------------------
-- Daily metrics: 14 days x 5 campaigns x 5 channels = 350 rows
--
-- Performance profiles (designed to create interesting analysis):
--
--   Campaigns:
--     Spring Sale 2025      — solid performer, moderate spend, good ROAS (~3.5x)
--     Brand Awareness Q1    — high impressions, high spend, low ROAS (~1.2x)
--     Product Launch Beta   — low spend, great conversion rate, excellent ROAS (~5x)
--     Holiday Campaign 2024 — massive spend, diminishing returns, mediocre ROAS (~1.8x)
--     Retargeting Push      — moderate impressions, high CTR, good ROAS (~4x), paused
--
--   Channels:
--     Google Ads (search)   — high intent: moderate impressions, high CTR (~6%), high conversion (~8%)
--     Facebook (social)     — high reach: huge impressions, low CTR (~1.2%), low conversion (~1.5%)
--     Instagram (social)    — visual: big impressions, moderate CTR (~2%), low conversion (~2%)
--     Email Newsletter      — targeted: low impressions, high CTR (~15%), high conversion (~12%)
--     YouTube (video)       — awareness: big impressions, low CTR (~0.8%), low conversion (~1%)
--
-- We use generate_series to create 14 days (day 0 = CURRENT_DATE - 13, day 13 = CURRENT_DATE).
-- A seeded pseudo-random variation is applied via a hash of (campaign_id, channel_id, day_offset)
-- so the data is deterministic but looks natural.
-- ---------------------------------------------------------------------------

INSERT INTO daily_metrics (id, campaign_id, channel_id, date, impressions, clicks, conversions, spend, revenue)
SELECT
    -- Deterministic UUID built from campaign ordinal, channel ordinal, day offset
    (
        'c' || lpad(c_ord::TEXT, 1, '0') ||
        lpad(ch_ord::TEXT, 1, '0') ||
        lpad(d_off::TEXT, 2, '0') ||
        '0000-0000-0000-0000-000000000000'
    )::UUID,
    cmp.id,
    chn.id,
    CURRENT_DATE - (13 - d_off) * INTERVAL '1 day',

    -- IMPRESSIONS: base from channel profile x campaign multiplier, +/- daily noise
    GREATEST(100, (
        -- Channel base impressions
        (CASE chn.name
            WHEN 'Google Ads'       THEN 4200
            WHEN 'Facebook'         THEN 18000
            WHEN 'Instagram'        THEN 14000
            WHEN 'Email Newsletter' THEN 1200
            WHEN 'YouTube'          THEN 22000
        END)
        -- Campaign multiplier
        * (CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 1.0
            WHEN 'Brand Awareness Q1'    THEN 1.6
            WHEN 'Product Launch Beta'   THEN 0.5
            WHEN 'Holiday Campaign 2024' THEN 2.2
            WHEN 'Retargeting Push'      THEN 0.7
        END)
        -- Daily variation: -15% to +15% using a deterministic hash
        * (0.85 + 0.30 * (
            (hashtext(cmp.name || chn.name || d_off::TEXT) & x'7FFFFFFF'::INT)::NUMERIC
            / x'7FFFFFFF'::INT::NUMERIC
        ))
        -- Week-over-week trend: "this week" (d_off >= 7) gets a slight bump for active campaigns
        * (CASE
            WHEN cmp.status = 'active' AND d_off >= 7 THEN 1.08
            WHEN cmp.status = 'completed' AND d_off >= 10 THEN 0.75  -- trailing off
            ELSE 1.0
        END)
    )::INT),

    -- CLICKS: impressions * CTR for channel, adjusted per campaign
    GREATEST(1, (
        (CASE chn.name
            WHEN 'Google Ads'       THEN 4200
            WHEN 'Facebook'         THEN 18000
            WHEN 'Instagram'        THEN 14000
            WHEN 'Email Newsletter' THEN 1200
            WHEN 'YouTube'          THEN 22000
        END)
        * (CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 1.0
            WHEN 'Brand Awareness Q1'    THEN 1.6
            WHEN 'Product Launch Beta'   THEN 0.5
            WHEN 'Holiday Campaign 2024' THEN 2.2
            WHEN 'Retargeting Push'      THEN 0.7
        END)
        * (0.85 + 0.30 * (
            (hashtext(cmp.name || chn.name || d_off::TEXT) & x'7FFFFFFF'::INT)::NUMERIC
            / x'7FFFFFFF'::INT::NUMERIC
        ))
        * (CASE
            WHEN cmp.status = 'active' AND d_off >= 7 THEN 1.08
            WHEN cmp.status = 'completed' AND d_off >= 10 THEN 0.75
            ELSE 1.0
        END)
        -- Channel CTR
        * (CASE chn.name
            WHEN 'Google Ads'       THEN 0.058
            WHEN 'Facebook'         THEN 0.012
            WHEN 'Instagram'        THEN 0.020
            WHEN 'Email Newsletter' THEN 0.150
            WHEN 'YouTube'          THEN 0.008
        END)
        -- Campaign CTR modifier
        * (CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 1.1
            WHEN 'Brand Awareness Q1'    THEN 0.8
            WHEN 'Product Launch Beta'   THEN 1.3
            WHEN 'Holiday Campaign 2024' THEN 0.9
            WHEN 'Retargeting Push'      THEN 1.5
        END)
        -- Click noise: -10% to +10%
        * (0.90 + 0.20 * (
            (hashtext('clk' || cmp.name || chn.name || d_off::TEXT) & x'7FFFFFFF'::INT)::NUMERIC
            / x'7FFFFFFF'::INT::NUMERIC
        ))
    )::INT),

    -- CONVERSIONS: clicks * conversion rate for channel, adjusted per campaign
    GREATEST(0, (
        -- re-derive clicks inline (same formula as above)
        (CASE chn.name
            WHEN 'Google Ads'       THEN 4200
            WHEN 'Facebook'         THEN 18000
            WHEN 'Instagram'        THEN 14000
            WHEN 'Email Newsletter' THEN 1200
            WHEN 'YouTube'          THEN 22000
        END)
        * (CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 1.0
            WHEN 'Brand Awareness Q1'    THEN 1.6
            WHEN 'Product Launch Beta'   THEN 0.5
            WHEN 'Holiday Campaign 2024' THEN 2.2
            WHEN 'Retargeting Push'      THEN 0.7
        END)
        * (0.85 + 0.30 * (
            (hashtext(cmp.name || chn.name || d_off::TEXT) & x'7FFFFFFF'::INT)::NUMERIC
            / x'7FFFFFFF'::INT::NUMERIC
        ))
        * (CASE
            WHEN cmp.status = 'active' AND d_off >= 7 THEN 1.08
            WHEN cmp.status = 'completed' AND d_off >= 10 THEN 0.75
            ELSE 1.0
        END)
        * (CASE chn.name
            WHEN 'Google Ads'       THEN 0.058
            WHEN 'Facebook'         THEN 0.012
            WHEN 'Instagram'        THEN 0.020
            WHEN 'Email Newsletter' THEN 0.150
            WHEN 'YouTube'          THEN 0.008
        END)
        * (CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 1.1
            WHEN 'Brand Awareness Q1'    THEN 0.8
            WHEN 'Product Launch Beta'   THEN 1.3
            WHEN 'Holiday Campaign 2024' THEN 0.9
            WHEN 'Retargeting Push'      THEN 1.5
        END)
        * (0.90 + 0.20 * (
            (hashtext('clk' || cmp.name || chn.name || d_off::TEXT) & x'7FFFFFFF'::INT)::NUMERIC
            / x'7FFFFFFF'::INT::NUMERIC
        ))
        -- Channel conversion rate
        * (CASE chn.name
            WHEN 'Google Ads'       THEN 0.082
            WHEN 'Facebook'         THEN 0.015
            WHEN 'Instagram'        THEN 0.020
            WHEN 'Email Newsletter' THEN 0.120
            WHEN 'YouTube'          THEN 0.010
        END)
        -- Campaign conversion modifier
        * (CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 1.2
            WHEN 'Brand Awareness Q1'    THEN 0.6
            WHEN 'Product Launch Beta'   THEN 1.8
            WHEN 'Holiday Campaign 2024' THEN 0.7
            WHEN 'Retargeting Push'      THEN 1.4
        END)
        -- Conversion noise: -12% to +12%
        * (0.88 + 0.24 * (
            (hashtext('conv' || cmp.name || chn.name || d_off::TEXT) & x'7FFFFFFF'::INT)::NUMERIC
            / x'7FFFFFFF'::INT::NUMERIC
        ))
    )::INT),

    -- SPEND: base CPC * clicks (channel-dependent), campaign budget pacing
    ROUND(
        (CASE chn.name
            WHEN 'Google Ads'       THEN 4200
            WHEN 'Facebook'         THEN 18000
            WHEN 'Instagram'        THEN 14000
            WHEN 'Email Newsletter' THEN 1200
            WHEN 'YouTube'          THEN 22000
        END)
        * (CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 1.0
            WHEN 'Brand Awareness Q1'    THEN 1.6
            WHEN 'Product Launch Beta'   THEN 0.5
            WHEN 'Holiday Campaign 2024' THEN 2.2
            WHEN 'Retargeting Push'      THEN 0.7
        END)
        * (0.85 + 0.30 * (
            (hashtext(cmp.name || chn.name || d_off::TEXT) & x'7FFFFFFF'::INT)::NUMERIC
            / x'7FFFFFFF'::INT::NUMERIC
        ))
        * (CASE
            WHEN cmp.status = 'active' AND d_off >= 7 THEN 1.08
            WHEN cmp.status = 'completed' AND d_off >= 10 THEN 0.75
            ELSE 1.0
        END)
        * (CASE chn.name
            WHEN 'Google Ads'       THEN 0.058
            WHEN 'Facebook'         THEN 0.012
            WHEN 'Instagram'        THEN 0.020
            WHEN 'Email Newsletter' THEN 0.150
            WHEN 'YouTube'          THEN 0.008
        END)
        * (CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 1.1
            WHEN 'Brand Awareness Q1'    THEN 0.8
            WHEN 'Product Launch Beta'   THEN 1.3
            WHEN 'Holiday Campaign 2024' THEN 0.9
            WHEN 'Retargeting Push'      THEN 1.5
        END)
        * (0.90 + 0.20 * (
            (hashtext('clk' || cmp.name || chn.name || d_off::TEXT) & x'7FFFFFFF'::INT)::NUMERIC
            / x'7FFFFFFF'::INT::NUMERIC
        ))
        -- Cost per click by channel
        * (CASE chn.name
            WHEN 'Google Ads'       THEN 2.40   -- search is expensive
            WHEN 'Facebook'         THEN 0.85
            WHEN 'Instagram'        THEN 1.10
            WHEN 'Email Newsletter' THEN 0.15   -- nearly free
            WHEN 'YouTube'          THEN 0.35
        END)
        -- Campaign budget pacing modifier
        * (CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 1.0
            WHEN 'Brand Awareness Q1'    THEN 1.4   -- overspending
            WHEN 'Product Launch Beta'   THEN 0.6   -- lean spend
            WHEN 'Holiday Campaign 2024' THEN 1.8   -- big spender
            WHEN 'Retargeting Push'      THEN 0.8
        END)
    , 2),

    -- REVENUE: spend * ROAS target, with per-channel and per-campaign modifiers
    ROUND(
        -- Start from spend (same derivation)
        (CASE chn.name
            WHEN 'Google Ads'       THEN 4200
            WHEN 'Facebook'         THEN 18000
            WHEN 'Instagram'        THEN 14000
            WHEN 'Email Newsletter' THEN 1200
            WHEN 'YouTube'          THEN 22000
        END)
        * (CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 1.0
            WHEN 'Brand Awareness Q1'    THEN 1.6
            WHEN 'Product Launch Beta'   THEN 0.5
            WHEN 'Holiday Campaign 2024' THEN 2.2
            WHEN 'Retargeting Push'      THEN 0.7
        END)
        * (0.85 + 0.30 * (
            (hashtext(cmp.name || chn.name || d_off::TEXT) & x'7FFFFFFF'::INT)::NUMERIC
            / x'7FFFFFFF'::INT::NUMERIC
        ))
        * (CASE
            WHEN cmp.status = 'active' AND d_off >= 7 THEN 1.08
            WHEN cmp.status = 'completed' AND d_off >= 10 THEN 0.75
            ELSE 1.0
        END)
        * (CASE chn.name
            WHEN 'Google Ads'       THEN 0.058
            WHEN 'Facebook'         THEN 0.012
            WHEN 'Instagram'        THEN 0.020
            WHEN 'Email Newsletter' THEN 0.150
            WHEN 'YouTube'          THEN 0.008
        END)
        * (CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 1.1
            WHEN 'Brand Awareness Q1'    THEN 0.8
            WHEN 'Product Launch Beta'   THEN 1.3
            WHEN 'Holiday Campaign 2024' THEN 0.9
            WHEN 'Retargeting Push'      THEN 1.5
        END)
        * (0.90 + 0.20 * (
            (hashtext('clk' || cmp.name || chn.name || d_off::TEXT) & x'7FFFFFFF'::INT)::NUMERIC
            / x'7FFFFFFF'::INT::NUMERIC
        ))
        -- CPC (same as spend)
        * (CASE chn.name
            WHEN 'Google Ads'       THEN 2.40
            WHEN 'Facebook'         THEN 0.85
            WHEN 'Instagram'        THEN 1.10
            WHEN 'Email Newsletter' THEN 0.15
            WHEN 'YouTube'          THEN 0.35
        END)
        * (CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 1.0
            WHEN 'Brand Awareness Q1'    THEN 1.4
            WHEN 'Product Launch Beta'   THEN 0.6
            WHEN 'Holiday Campaign 2024' THEN 1.8
            WHEN 'Retargeting Push'      THEN 0.8
        END)
        -- Now multiply by ROAS target
        * (CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 3.5   -- solid ROAS
            WHEN 'Brand Awareness Q1'    THEN 1.2   -- low ROAS, awareness play
            WHEN 'Product Launch Beta'   THEN 5.0   -- excellent ROAS
            WHEN 'Holiday Campaign 2024' THEN 1.8   -- mediocre ROAS despite huge spend
            WHEN 'Retargeting Push'      THEN 4.0   -- good ROAS on retargeting
        END)
        -- Channel revenue modifier (search and email convert better to revenue)
        * (CASE chn.name
            WHEN 'Google Ads'       THEN 1.15
            WHEN 'Facebook'         THEN 0.85
            WHEN 'Instagram'        THEN 0.90
            WHEN 'Email Newsletter' THEN 1.25
            WHEN 'YouTube'          THEN 0.70
        END)
        -- Revenue noise: -8% to +8%
        * (0.92 + 0.16 * (
            (hashtext('rev' || cmp.name || chn.name || d_off::TEXT) & x'7FFFFFFF'::INT)::NUMERIC
            / x'7FFFFFFF'::INT::NUMERIC
        ))
    , 2)

FROM
    campaigns cmp
    CROSS JOIN channels chn
    CROSS JOIN generate_series(0, 13) AS d_off
    -- Derive ordinals for deterministic UUID generation
    CROSS JOIN LATERAL (
        SELECT CASE cmp.name
            WHEN 'Spring Sale 2025'      THEN 1
            WHEN 'Brand Awareness Q1'    THEN 2
            WHEN 'Product Launch Beta'   THEN 3
            WHEN 'Holiday Campaign 2024' THEN 4
            WHEN 'Retargeting Push'      THEN 5
        END AS c_ord
    ) co
    CROSS JOIN LATERAL (
        SELECT CASE chn.name
            WHEN 'Google Ads'       THEN 1
            WHEN 'Facebook'         THEN 2
            WHEN 'Instagram'        THEN 3
            WHEN 'Email Newsletter' THEN 4
            WHEN 'YouTube'          THEN 5
        END AS ch_ord
    ) cho
ORDER BY cmp.name, chn.name, d_off;

-- ============================================================================
-- Done. Summary:
--   - 4 tables: campaigns, channels, daily_metrics, reports
--   - 4 indexes on frequently queried columns
--   - RLS enabled on all tables with SELECT policies for authenticated role
--   - 4 RPC functions: list_campaigns, list_channels, get_metrics, get_timeseries
--   - 5 campaigns, 5 channels, 350 daily_metrics rows (14 days)
-- ============================================================================
