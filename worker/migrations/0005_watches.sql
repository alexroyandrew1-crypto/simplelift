-- v31: multi-watch pairing. Each watch has its own token row with device metadata.
-- Existing watch tokens stay valid (id is backfilled; device fields may be null).
-- DO NOT run this on production D1 until you are ready to deploy v31. Use wrangler dev / local D1 first.
ALTER TABLE tokens ADD COLUMN id TEXT;
ALTER TABLE tokens ADD COLUMN device_id TEXT;
ALTER TABLE tokens ADD COLUMN model TEXT;
ALTER TABLE tokens ADD COLUMN name TEXT;
ALTER TABLE tokens ADD COLUMN last_seen INTEGER;
ALTER TABLE tokens ADD COLUMN revoked INTEGER NOT NULL DEFAULT 0;

UPDATE tokens SET id = lower(hex(randomblob(8))) WHERE id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tokens_id ON tokens(id) WHERE id IS NOT NULL;

-- Watch-requested pairing codes (the phone claims these with a signed-in account).
CREATE TABLE IF NOT EXISTS pair_requests (
  code TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  model TEXT,
  name TEXT,
  expires INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  claimed_user_id TEXT,
  watch_token TEXT,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pair_requests_device ON pair_requests(device_id);
