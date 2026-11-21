-- Live workout snapshot. One row per account, separate from the account blob's `active`
-- field so a second phone cannot revive a finished session. Not applied by this repo;
-- run it on the Worker's D1 database when the live routes are merged. Do not deploy from here.
CREATE TABLE IF NOT EXISTS live_session (
  user_id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  snap TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
