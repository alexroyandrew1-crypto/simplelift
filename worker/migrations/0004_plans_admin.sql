-- Manual Free/Paid plans + admin audit log. Run once:
--   npx wrangler d1 execute simplelift --remote --file migrations/0004_plans_admin.sql
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
-- Do not put a personal email in this file. After the migration, set the owner's plan
-- yourself: UPDATE users SET plan='paid' WHERE email='owner@example.com';
CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id TEXT NOT NULL, user_id TEXT NOT NULL, from_plan TEXT, to_plan TEXT NOT NULL, at INTEGER NOT NULL);
