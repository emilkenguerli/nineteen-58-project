ALTER TABLE reports ADD COLUMN IF NOT EXISTS title TEXT;
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);
