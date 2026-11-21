-- Simple Lift AI plan features: only COUNTS and SPEND are stored, never plan text.
-- Run once: npx wrangler d1 execute simplelift --remote --file migrations/0003_ai.sql
CREATE TABLE IF NOT EXISTS ai_usage (user_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));
CREATE TABLE IF NOT EXISTS ai_spend (id INTEGER PRIMARY KEY CHECK (id = 1), total_usd_micros INTEGER NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO ai_spend(id,total_usd_micros,calls,updated_at) VALUES(1,0,0,0);
-- Owner alert emails: at most one per reason per 24h ('credit' | 'low' | 'cap').
CREATE TABLE IF NOT EXISTS ai_alerts (reason TEXT PRIMARY KEY, sent_at INTEGER NOT NULL);
