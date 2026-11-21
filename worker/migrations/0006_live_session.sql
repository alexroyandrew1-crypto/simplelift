-- v34: live in-progress workout snapshot shared by the phone and the watch.
-- Run once: npx wrangler d1 execute simplelift --remote --file migrations/0006_live_session.sql
-- Safe to re-run (IF NOT EXISTS). Does not change existing tables.
CREATE TABLE IF NOT EXISTS live_session (
  user_id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  snap TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
