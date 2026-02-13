import { tool } from 'ai';
import { z } from 'zod';
import { supabaseAdmin } from './supabase-admin';

export const reportTools = {
  listCampaigns: tool({
    description: 'Fetch marketing campaigns, optionally filtered by status and/or date range. Use this to discover campaign names and IDs before querying metrics.',
    inputSchema: z.object({
      status: z.enum(['active', 'paused', 'completed']).optional().describe('Filter by campaign status'),
      startDate: z.string().optional().describe('Filter campaigns starting on or after this date (YYYY-MM-DD)'),
      endDate: z.string().optional().describe('Filter campaigns ending on or before this date (YYYY-MM-DD)'),
    }),
    execute: async ({ status, startDate, endDate }) => {
      try {
        const { data, error } = await supabaseAdmin.rpc('list_campaigns', {
          p_status: status ?? null,
          p_start_date: startDate ?? null,
          p_end_date: endDate ?? null,
        });
        if (error) throw error;
        return { ok: true as const, data };
      } catch (err) {
        return { ok: false as const, error: `Failed to fetch campaigns: ${(err as Error).message}` };
      }
    },
  }),

  listChannels: tool({
    description: 'Fetch available marketing channels, optionally filtered by type. Use this to discover channel names and IDs.',
    inputSchema: z.object({
      type: z.enum(['social', 'search', 'display', 'email', 'video']).optional().describe('Filter by channel type'),
    }),
    execute: async ({ type }) => {
      try {
        const { data, error } = await supabaseAdmin.rpc('list_channels', {
          p_type: type ?? null,
        });
        if (error) throw error;
        return { ok: true as const, data };
      } catch (err) {
        return { ok: false as const, error: `Failed to fetch channels: ${(err as Error).message}` };
      }
    },
  }),

  getMetrics: tool({
    description: 'Get aggregated marketing metrics (impressions, clicks, conversions, spend, revenue, CTR, conversion rate, ROAS) grouped by campaign, channel, or both. Use for KPI summaries and comparison tables.',
    inputSchema: z.object({
      campaignId: z.string().optional().describe('Filter to a specific campaign UUID'),
      channelId: z.string().optional().describe('Filter to a specific channel UUID'),
      startDate: z.string().optional().describe('Start of date range (YYYY-MM-DD)'),
      endDate: z.string().optional().describe('End of date range (YYYY-MM-DD)'),
      groupBy: z.enum(['campaign', 'channel', 'both']).default('campaign').describe('How to group the results'),
    }),
    execute: async ({ campaignId, channelId, startDate, endDate, groupBy }) => {
      try {
        const { data, error } = await supabaseAdmin.rpc('get_metrics', {
          p_campaign_id: campaignId ?? null,
          p_channel_id: channelId ?? null,
          p_start_date: startDate ?? null,
          p_end_date: endDate ?? null,
          p_group_by: groupBy,
        });
        if (error) throw error;
        return { ok: true as const, data };
      } catch (err) {
        return { ok: false as const, error: `Failed to fetch metrics: ${(err as Error).message}` };
      }
    },
  }),

  getTimeseries: tool({
    description: 'Get daily time-series data for a specific metric. Use for line charts and trend analysis. Supports filtering by campaign and channel.',
    inputSchema: z.object({
      campaignId: z.string().optional().describe('Filter to a specific campaign UUID'),
      channelId: z.string().optional().describe('Filter to a specific channel UUID'),
      startDate: z.string().optional().describe('Start of date range (YYYY-MM-DD)'),
      endDate: z.string().optional().describe('End of date range (YYYY-MM-DD)'),
      metric: z.enum(['impressions', 'clicks', 'conversions', 'spend', 'revenue']).default('revenue').describe('Which metric to return'),
    }),
    execute: async ({ campaignId, channelId, startDate, endDate, metric }) => {
      try {
        const { data, error } = await supabaseAdmin.rpc('get_timeseries', {
          p_campaign_id: campaignId ?? null,
          p_channel_id: channelId ?? null,
          p_start_date: startDate ?? null,
          p_end_date: endDate ?? null,
          p_metric: metric,
        });
        if (error) throw error;
        return { ok: true as const, data };
      } catch (err) {
        return { ok: false as const, error: `Failed to fetch timeseries: ${(err as Error).message}` };
      }
    },
  }),
};
