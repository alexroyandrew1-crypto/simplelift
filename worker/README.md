# Simple Lift API (Cloudflare Worker + D1, free tier)

The optional account and sync server for Simple Lift and the Garmin watch app. It stores only an email, a salted password hash, the app's data blob (plans, history, settings; ≤ 1 MB), short-lived pairing codes, and pending watch results. There are no analytics, no ads, and no third parties.

## Endpoints (JSON)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | /register `{email,password}` | – | 5/hour per IP. Password 8–200 chars. Returns `{token,email}` |
| POST | /login `{email,password}` | – | 10/15 min per IP. Token lasts ~1 year (only its SHA-256 is stored) |
| POST | /logout | web | revokes the token |
| GET | /data | web | `{data,updatedAt,version,watchResults}` |
| PUT | /data `{data,updatedAt,watchCode?,ackResults?}` | web | merge: newest blob wins, `history`/`plans` unioned by id, `deleted` tombstones; returns merged data + pending watch results |
| POST | /pair/request `{deviceId,model?,name?}` | – | watch asks for a 6-digit code, 10 min. Limited per IP and per device, not globally |
| POST | /pair/status `{code,deviceId}` | – | watch polls until the phone claims the code, then receives its token once |
| POST | /pair/claim `{code}` | web | signed-in verified phone. 5 wrong guesses per code and per account burn the code. No unauthenticated claim |
| GET | /watch/workout | watch | `{code:"SL1~…"}` (the app pre-computes it; plan-based fallback) |
| POST | /watch/result `{code:"SR1~…"}` | watch | queued until the app syncs (max 50) |

CORS allows only `ALLOWED_ORIGIN` (`https://alexroyandrew1-crypto.github.io`). There is no wildcard.

**Passwords:** PBKDF2-SHA256 with a 16-byte per-user salt. Workers' WebCrypto caps one PBKDF2 call at 100,000 iterations, so the hash chains `PBKDF2_PASSES` (default 2) passes of 100k = **200k iterations**. The pass count is stored per user, so it can be changed later without breaking old accounts. If the free plan's 10 ms CPU limit causes errors (Cloudflare error 1102) on /register or /login, set `PBKDF2_PASSES = "1"` (100k).

## Deploy (needs a free Cloudflare account)
```sh
cd simplelift-api && npm install
npx wrangler login                          # opens a browser to sign in to Cloudflare
npx wrangler d1 create simplelift           # copy the printed database_id into wrangler.toml
npx wrangler d1 execute simplelift --remote --file schema.sql
npx wrangler deploy                         # prints https://simplelift-api.<subdomain>.workers.dev
```
Then:
1. Web app: set `API_URL='https://simplelift-api.<subdomain>.workers.dev'` in `simplelift/config.js`, bump the version, and upload.
2. Watch: set the `apiUrl` default in `simplelift-garmin/resources/settings/properties.xml` to the same URL, then rebuild.

## Local test (no Cloudflare login)
```sh
npx wrangler d1 execute simplelift --local --file schema.sql
npx wrangler dev --local --port 8787 --var ALLOWED_ORIGIN:https://alexroyandrew1-crypto.github.io,http://localhost:8765
./test/run.sh        # offline auth tests (node test/auth.test.mjs, 40 checks) + full flow against wrangler dev
```

## Email verification and password reset (v15)
Routes (all JSON):
- `POST /register` → `{token,email,verified:false[,mailError]}` and emails a 6-digit code. `mailError` is `mail_not_configured` or `mail_failed` if the email couldn't go out (the account still exists; the user can tap Resend later).
- `POST /login` → also returns `verified`. Unverified accounts can sign in, but `GET/PUT /data` and `POST /pair/claim` return **403 `{error:"unverified"}`**.
- `POST /auth/verify {email,code}` → `{ok,verified:true}`; wrong code = 400 `{error:"bad_code"}`, 5th wrong try burns the code = `{error:"code_locked"}`.
- `POST /auth/resend` (Bearer web token) → new code. Limited to 1 per 60 s and 5 per hour per account (shared with reset codes).
- `POST /auth/forgot {email}` → always `{ok:true,…}` (same answer for unknown emails, rate-limited or failed mail).
- `POST /auth/reset {email,code,newPassword}` → new password (8–200 chars, same PBKDF2 as register), deletes **all** tokens and pairing codes (other devices + watch signed out), marks the account verified, returns a fresh token.

Codes: 6 digits, only `SHA-256(purpose:userId:code)` stored in table `codes`, 15-minute life, 5 tries, single use. Codes and email addresses are never logged; mail errors log only a short code like `mail error: mail_auth_failed_400`.

### Migration for the existing live DB (run once, before deploying the new code)
```sh
npx wrangler d1 execute simplelift --remote --file migrations/0002_email_codes.sql
```
Adds `users.verified` (DEFAULT 1, so any existing accounts count as verified) and the `codes` table. Fresh installs can just use `schema.sql`.

### Mail settings (Worker secrets)
`sendMail(env,{to,subject,text})` sends plain text from **"Simple Lift" <MAIL_FROM>**.
- `MAIL_PROVIDER` = `gmail` (default) or `resend`
- `MAIL_FROM` = the sending address, e.g. `simpleliftsupport@gmail.com` (for Gmail it must be the account that made the refresh token)
- Gmail: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`
- Resend (needs your own domain verified in Resend): `RESEND_API_KEY`
```sh
npx wrangler secret put MAIL_FROM
npx wrangler secret put GMAIL_CLIENT_ID
npx wrangler secret put GMAIL_CLIENT_SECRET
npx wrangler secret put GMAIL_REFRESH_TOKEN
# later, to switch:  npx wrangler secret put MAIL_PROVIDER   (value: resend)  and  npx wrangler secret put RESEND_API_KEY
```
If the secrets are missing the server still runs: sign-up works, `mailError:"mail_not_configured"` is returned, resend returns 503, forgot stays generic.

### One-time: get Gmail API credentials (do this signed in as the support Gmail account)
1. Go to https://console.cloud.google.com/ → create a project, e.g. **Simple Lift Mail**.
2. APIs & Services → Library → **Gmail API** → Enable.
3. APIs & Services → OAuth consent screen (Google Auth Platform): User type **External**, app name "Simple Lift", support email = the support Gmail, developer contact = same. Scopes: add **`https://www.googleapis.com/auth/gmail.send`** only. Audience: add the support Gmail as a **test user**.
   - Important: while the app is in **Testing**, Google expires refresh tokens after **7 days**. Click **Publish app** (In production). With only the gmail.send scope used by your own account you can use it unverified (you'll see an "unverified app" warning once when you consent — click Advanced → continue). The refresh token then doesn't expire unless revoked, unused for 6 months, or the password changes.
4. APIs & Services → Credentials → Create credentials → **OAuth client ID** → type **Web application**; Authorized redirect URI: `https://developers.google.com/oauthplayground`. Copy the **Client ID** and **Client secret**.
5. Open https://developers.google.com/oauthplayground → gear icon → tick **Use your own OAuth credentials**, paste the client ID/secret. In "Input your own scopes" enter `https://www.googleapis.com/auth/gmail.send` → Authorize APIs → sign in as the support Gmail → allow.
6. Click **Exchange authorization code for tokens** → copy the **Refresh token**.
7. Run the `wrangler secret put` commands above with those values (MAIL_FROM = the support Gmail address), then `npx wrangler deploy`.
8. Test: create an account in the app with a real address → the code email should arrive from "Simple Lift". Gmail's free limit is about 500 sends/day, plenty for this app.

## AI plan features (v17)
Routes: `POST /ai/plan` `{answers}` and `POST /ai/parse` `{text}` (≤6000 chars), both need a signed-in, verified account. They call xAI chat completions (`AI_MODEL`, default grok-4.3) with a strict JSON schema, then validate/clamp the plan. Only counts and spend are stored (tables `ai_usage`, `ai_spend`, migration 0003), never plan text. When you use the AI plan features, the answers/text you submit are sent to xAI (Grok API) to generate your plan; nothing else is sent and it isn't stored by Simple Lift.

`POST /ai/parse-image` `{image, mime}` (data URL or base64, JPEG/PNG only, ≤4 MB decoded; paid + verified) sends the photo to xAI with `AI_VISION_MODEL` (default grok-4.3) and returns the same validated plan as `/ai/parse`. Same daily limits (one AI call each), same spend ledger and US$20 cap (reserves a worst-case image estimate first). Photos you choose to import with AI are sent to xAI (Grok) to be read and are not stored or logged by Simple Lift.
Caps: `AI_DAILY_LIMIT` (5/user/UTC day) and `AI_GLOBAL_DAILY_LIMIT` (300) -> 429 `{error:'limit',remaining:0,resetsAt}`; `AI_SPEND_CAP_USD` (20) -> 503 `{error:'ai_unavailable',reason:'budget'}`. Missing key -> 503 `ai_unavailable`.
Key (secret only): from this directory, `npx wrangler secret put XAI_API_KEY < /path/to/keyfile` (or `printf %s "$XAI_API_KEY" | npx wrangler secret put XAI_API_KEY`). Optional `ADMIN_TOKEN` secret enables `GET /ai/budget`. Spend from the box: `node scripts/ai-status.mjs`. Do not commit the key.

## Free / Paid plans and the admin page
AI routes need `users.plan = 'paid'` (free users get 403 `not_paid` and the app uses the free built-in builder). Migration 0004 adds the column (default 'free'). Set your own account to paid with SQL after that migration. Do not put a personal email in the migration file.
Admin page: open `https://simplelift-api.<your-subdomain>.workers.dev/admin` and sign in with a verified Simple Lift account whose email is in `ADMIN_EMAILS`. That value is a Worker secret or a deploy-time var, not a line in `wrangler.toml` (this repository is public). The page shows AI spend vs the cap and every account (email, joined, verified, plan, AI calls today/total) with a Free/Paid toggle. Every change is written to `admin_log`. Backend: `GET /admin/users?q=`, `POST /admin/users/:id/plan {plan}`, `GET /admin/ai-status`, `GET /auth/me`. `OWNER_ALERT_EMAIL` is the same kind of secret: if it is unset, owner alerts are skipped.

## Live workout, plans, and watch settings
These routes are in this Worker. They are not on production until the D1 migrations below have been applied and the Worker is deployed. Do not deploy from a pull request.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET, POST | `/live` | web | `{snap, checkMode}`. POST body `{snap}` is capped at 64 KB, checked, and stored with a server-assigned `rev` (unix seconds). A client `rev` is ignored. |
| GET, POST | `/watch/live` | watch | same snapshot |
| GET | `/watch/plans` | watch | every saved plan plus today's day. Reads `data.blob`. |
| GET, PUT | `/watch/settings` | web | phone reads and writes watch settings. `rev` is server time. |
| POST | `/watch/settings` | watch | the watch patches the same row |
| GET | `/watch/workout` | watch | existing route, plus `checkMode` and `watchSettings` |

`GET /watch/workout` still works if `watch_settings` has not been created yet. `/live` and `/watch/settings` need their tables.

Account deletion and password reset also delete `live_session`, `watch_settings`, and `pair_requests` rows for that account. Password reset still keeps the saved plan blob. Deletion does not remove the anonymous AI spend total or IP rate-limit counters.

### Migrations still to run on production D1
Run these yourself, in order, against the database you intend to deploy to. This repository does not run them.

```sh
npx wrangler d1 execute simplelift --remote --file migrations/0006_live_session.sql
npx wrangler d1 execute simplelift --remote --file migrations/0007_watch_settings.sql
```

`0005_watches.sql` is required for the current pairing routes if that migration is not already on the database. `0002` through `0004` match the Worker that was already deployed. Confirm before re-running any `ALTER` that is not `IF NOT EXISTS`.

## Secrets (never commit)
Set with `npx wrangler secret put <NAME>`:

- `MAIL_FROM`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (or `MAIL_PROVIDER` and `RESEND_API_KEY`)
- `XAI_API_KEY`, optional `ADMIN_TOKEN`
- `ADMIN_EMAILS`, `OWNER_ALERT_EMAIL`

`wrangler.toml` keeps the non-secret vars (`ALLOWED_ORIGIN`, AI prices and caps, `PBKDF2_PASSES`, `DEFAULT_PLAN`) and the D1 database id. The database id is not a credential. Wrangler still needs a Cloudflare login to use it.
