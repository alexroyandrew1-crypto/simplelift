-- Simple Lift: email verification + password reset (safe on the existing live DB).
-- Run once:  npx wrangler d1 execute simplelift --remote --file migrations/0002_email_codes.sql
-- Existing accounts get verified=1 through the DEFAULT; new sign-ups insert verified=0 explicitly.
ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 1;
-- One live code per account and purpose ('verify' | 'reset'). Only SHA-256(purpose:user:code) is stored.
CREATE TABLE IF NOT EXISTS codes (
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, purpose)
);
