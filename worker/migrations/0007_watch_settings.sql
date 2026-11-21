-- Per-account watch settings (chime, vibration, heart-rate display, rep counting, rest alert).
-- Run once before deploying the watch settings routes:
--   npx wrangler d1 execute simplelift --remote --file migrations/0007_watch_settings.sql
-- Safe to re-run (IF NOT EXISTS). Does not change existing tables.
CREATE TABLE IF NOT EXISTS watch_settings (
  user_id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  rev INTEGER NOT NULL
);
