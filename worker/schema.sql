-- Simple Lift API schema (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  iter INTEGER NOT NULL,
  created INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 1 -- new sign-ups insert 0 until the emailed code is entered
);
-- kind: 'web' (full account access) or 'watch' (watch endpoints only). Only SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS tokens (
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_user ON tokens(user_id);
CREATE TABLE IF NOT EXISTS data (
  user_id TEXT PRIMARY KEY,
  blob TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pairs (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS results_user ON results(user_id);
-- fixed-window rate-limit counters, key = action:ip:window
CREATE TABLE IF NOT EXISTS rl (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
-- hashed 6-digit email codes ('verify' | 'reset'), 15-minute life, 5 tries
CREATE TABLE IF NOT EXISTS codes (
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, purpose)
);

-- v16+: AI plan features (see migrations/0003_ai.sql)
CREATE TABLE IF NOT EXISTS ai_usage (user_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));
CREATE TABLE IF NOT EXISTS ai_spend (id INTEGER PRIMARY KEY CHECK (id = 1), total_usd_micros INTEGER NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO ai_spend(id,total_usd_micros,calls,updated_at) VALUES(1,0,0,0);
CREATE TABLE IF NOT EXISTS ai_alerts (reason TEXT PRIMARY KEY, sent_at INTEGER NOT NULL);
-- v17: plans + admin (see migrations/0004_plans_admin.sql; fresh installs: users.plan is added by that migration)
CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id TEXT NOT NULL, user_id TEXT NOT NULL, from_plan TEXT, to_plan TEXT NOT NULL, at INTEGER NOT NULL);

-- v31 multi-watch columns and pair_requests: see migrations/0005_watches.sql

-- v34 live snapshot: see migrations/0006_live_session.sql
CREATE TABLE IF NOT EXISTS live_session (
  user_id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  snap TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Watch settings: see migrations/0007_watch_settings.sql
CREATE TABLE IF NOT EXISTS watch_settings (
  user_id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  rev INTEGER NOT NULL
);
