// Simple Lift API — Cloudflare Worker + D1. No tracking, no third parties.
// Stores only: email, password hash, the app's data blob (plans, history, settings), pairing codes, watch results.

const MAX_BLOB = 1024 * 1024;            // 1 MB
const TOKEN_LIFE = 365 * 864e5;          // ~1 year
const PAIR_LIFE = 10 * 6e4;              // 10 minutes
// Workers WebCrypto caps a single PBKDF2 call at 100,000 iterations, so we chain
// two 100k PBKDF2-SHA256 passes (output of pass 1 is the key for pass 2) = 200k total.
const PBKDF2_PASS = 100000;
const passesFor = env => Math.max(1, Math.min(3, +(env.PBKDF2_PASSES || 2))); // set PBKDF2_PASSES=1 if the free plan's CPU limit is hit
const CODE_LIFE = 15 * 6e4;             // email codes: 15 minutes
const CODE_TRIES = 5;                    // wrong guesses before a code is burned
// Per IP unless rateLimit is given a key. There is no global pairing cap: one caller must not be able to block pairing for everyone.
const LIMITS = { mail1: [1, 60], mailH: [5, 3600], verify: [20, 900], reset: [20, 900], forgot: [10, 3600], register: [5, 3600], login: [10, 900], loginEmail: [10, 900], claim: [20, 900], claimAcct: [20, 900], pairreq: [10, 900], pairreqDev: [10, 900], delacct: [10, 900] }; // [max, windowSec]
const PAIR_FAIL_MAX = CODE_TRIES; // wrong pairing guesses per account and per code before that code is burned
const PAIR_FAIL_WIN = 900;

import { AI_MAX_TEXT, AI_MAX_TOKENS, AI_TIMEOUT_MS, SCHEMA, normPlan, normAnswers, messages, costMicros, worstMicros, worstImageMicros, capMicros, AI_MAX_IMAGE_BODY, AI_MAX_IMAGE_BYTES, AI_MAX_IMAGES, IMAGE_MIMES, utcDay, resetsAt, aiLang } from './ai.js';
import { HttpError } from './errors.js';
import { LIVE_MAX_BODY, validateSnap, saveSnap, readSnap, readCheckMode, readAutoDetect, normMode, serverNow } from './live-routes.js';
import { watchPlanRoutes } from './watch-plans.js';
import { watchSettingsRoutes, attachWatchSettings, readWatchSettings } from './watch-settings.mjs';

const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const now = () => Date.now();

async function pbkdf2(password, saltHex, passes) {
  let keyBytes = enc.encode(password); const salt = unhex(saltHex);
  for (let i = 0; i < passes; i++) {
    const k = await crypto.subtle.importKey('raw', keyBytes, 'PBKDF2', false, ['deriveBits']);
    keyBytes = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_PASS }, k, 256));
  }
  return hex(keyBytes);
}
function safeEq(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

// ---- email: one sendMail() for every provider. Never logs addresses or message bodies (codes). ----
class MailError extends Error { constructor(code) { super(code); this.code = code; } }
const b64 = s => btoa(String.fromCharCode(...enc.encode(s)));
const b64url = s => b64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sendMail(env, { to, subject, text }) {
  const provider = (env.MAIL_PROVIDER || 'gmail').toLowerCase();
  const from = env.MAIL_FROM;
  if (!from || !validEmail(from)) throw new MailError('mail_not_configured');
  const f = env.FETCH || fetch; // tests inject a fake fetch
  if (provider === 'resend') {
    if (!env.RESEND_API_KEY) throw new MailError('mail_not_configured');
    const r = await f('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `Simple Lift <${from}>`, to: [to], subject, text }) });
    if (!r.ok) throw new MailError('mail_send_failed_' + r.status);
    return true;
  }
  if (provider !== 'gmail') throw new MailError('mail_not_configured');
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) throw new MailError('mail_not_configured');
  const t = await f('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString() });
  const tj = await t.json().catch(() => ({}));
  if (!t.ok || !tj.access_token) throw new MailError('mail_auth_failed_' + t.status);
  const mime = [`From: Simple Lift <${from}>`, `To: ${to}`, `Subject: =?UTF-8?B?${b64(subject)}?=`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text)].join('\r\n');
  const r = await f('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST',
    headers: { Authorization: 'Bearer ' + tj.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64url(mime) }) });
  if (!r.ok) throw new MailError('mail_send_failed_' + r.status);
  return true;
}

// ---- 6-digit email codes (purpose 'verify' or 'reset'). Only a hash is stored. ----
const sixDigits = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
const codeHash = (userId, purpose, code) => sha256(`${purpose}:${userId}:${code}`);
const normCode = c => (typeof c === 'string' || typeof c === 'number') ? String(c).replace(/\D/g, '') : '';
async function issueCode(env, req, user, purpose) {
  const acct = 'u:' + user.id;
  await rateLimit(env, req, 'mail1', acct); await rateLimit(env, req, 'mailH', acct); // 1 per 60 s, 5 per hour per account
  const code = sixDigits();
  await env.DB.prepare('INSERT INTO codes(user_id,purpose,hash,expires,tries) VALUES(?,?,?,?,0) ON CONFLICT(user_id,purpose) DO UPDATE SET hash=excluded.hash,expires=excluded.expires,tries=0')
    .bind(user.id, purpose, await codeHash(user.id, purpose, code), now() + CODE_LIFE).run();
  const text = purpose === 'verify'
    ? `Your Simple Lift verification code is ${code}\n\nEnter it in the app to finish creating your account. It expires in 15 minutes.\n\nIf you didn't sign up for Simple Lift, ignore this email.`
    : `Your Simple Lift password reset code is ${code}\n\nEnter it in the app with your new password. It expires in 15 minutes.\n\nIf you didn't ask to reset your password, ignore this email. Your password has not changed.`;
  await sendMail(env, { to: user.email, subject: purpose === 'verify' ? 'Your Simple Lift code' : 'Reset your Simple Lift password', text });
}
// Checks a code; burns it after CODE_TRIES wrong guesses or on success.
async function useCode(env, userId, purpose, code) {
  const bad = new HttpError(400, 'Wrong or expired code', 'bad_code');
  if (!userId || code.length !== 6) throw bad;
  const row = await env.DB.prepare('SELECT hash,expires,tries FROM codes WHERE user_id=? AND purpose=?').bind(userId, purpose).first();
  if (!row || row.expires < now() || row.tries >= CODE_TRIES) throw bad;
  if (!safeEq(await codeHash(userId, purpose, code), row.hash)) {
    await env.DB.prepare('UPDATE codes SET tries=tries+1 WHERE user_id=? AND purpose=?').bind(userId, purpose).run();
    if (row.tries + 1 >= CODE_TRIES) throw new HttpError(400, 'Too many wrong tries. Ask for a new code.', 'code_locked');
    throw bad;
  }
  await env.DB.prepare('DELETE FROM codes WHERE user_id=? AND purpose=?').bind(userId, purpose).run();
}
async function requireVerified(env, userId) {
  const u = await env.DB.prepare('SELECT verified FROM users WHERE id=?').bind(userId).first();
  if (!u || !u.verified) throw new HttpError(403, 'Verify your email first. Enter the 6-digit code we emailed you.', 'unverified');
}
const mailFail = e => { if (!(e instanceof MailError)) throw e; console.error('mail error: ' + e.code); return e.code === 'mail_not_configured' ? 'mail_not_configured' : 'mail_failed'; };

function cors(req, env) {
  const o = req.headers.get('Origin'); const h = { 'Vary': 'Origin' };
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  if (o && allowed.includes(o)) Object.assign(h, {
    'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Max-Age': '86400' });
  return h;
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function body(req, max = 4096) {
  const t = await req.text();
  if (t.length > max) throw new HttpError(413, 'Request too large');
  try { return t ? JSON.parse(t) : {}; } catch { throw new HttpError(400, 'Invalid JSON'); }
}
// IPv6 clients are grouped by /64 so rotating addresses inside one network share a counter.
function ipKey(req) { const ip = req.headers.get('CF-Connecting-IP') || 'local'; return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') + '::/64' : ip; }
async function rateLimit(env, req, action, keyOverride) {
  const [max, win] = LIMITS[action]; const ip = keyOverride || ipKey(req);
  const w = Math.floor(now() / 1000 / win); const key = `${action}:${ip}:${w}`;
  const r = await env.DB.prepare('INSERT INTO rl(key,n,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1 RETURNING n')
    .bind(key, (w + 1) * win * 1000).first();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rl WHERE expires<?').bind(now()).run();
  if (r.n > max) throw new HttpError(429, 'Too many attempts. Try again later.');
}
function pairFailKey(kind, id) {
  const w = Math.floor(now() / 1000 / PAIR_FAIL_WIN);
  return `pf:${kind}:${id}:${w}`;
}
async function pairFailCount(env, kind, id) {
  const row = await env.DB.prepare('SELECT n FROM rl WHERE key=?').bind(pairFailKey(kind, id)).first();
  return row ? row.n : 0;
}
async function addPairFail(env, kind, id) {
  const key = pairFailKey(kind, id);
  const w = Math.floor(now() / 1000 / PAIR_FAIL_WIN);
  const r = await env.DB.prepare('INSERT INTO rl(key,n,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1 RETURNING n')
    .bind(key, (w + 1) * PAIR_FAIL_WIN * 1000).first();
  return r.n;
}
async function clearPairFail(env, kind, id) {
  await env.DB.prepare('DELETE FROM rl WHERE key=?').bind(pairFailKey(kind, id)).run();
}
// Migrations 0005, 0006, and 0007 add these tables. A missing table must not block account deletion or password reset.
async function deleteIfPresent(env, sql, id) {
  try { await env.DB.prepare(sql).bind(id).run(); }
  catch (e) { if (!/no such table/i.test(String(e && (e.message || e)))) throw e; }
}
async function readWatchSettingsSafe(db, userId) {
  try { return await readWatchSettings(db, userId); }
  catch (e) { if (/no such table/i.test(String(e && (e.message || e)))) return null; throw e; }
}
async function newToken(env, userId, kind) {
  const t = hex(rand(32));
  const id = hex(rand(8));
  // id/device columns exist after 0005; the INSERT lists only original columns plus id when kind is watch.
  try {
    await env.DB.prepare('INSERT INTO tokens(hash,user_id,kind,created,expires,id,revoked) VALUES(?,?,?,?,?,?,0)').bind(await sha256(t), userId, kind, now(), now() + TOKEN_LIFE, id).run();
  } catch (e) {
    await env.DB.prepare('INSERT INTO tokens(hash,user_id,kind,created,expires) VALUES(?,?,?,?,?)').bind(await sha256(t), userId, kind, now(), now() + TOKEN_LIFE).run();
  }
  return t;
}
async function newWatchToken(env, userId, meta = {}) {
  const t = hex(rand(32)), id = hex(rand(8));
  await env.DB.prepare('INSERT INTO tokens(hash,user_id,kind,created,expires,id,device_id,model,name,last_seen,revoked) VALUES(?,?,?,?,?,?,?,?,?,?,0)')
    .bind(await sha256(t), userId, 'watch', now(), now() + TOKEN_LIFE, id, meta.deviceId || null, meta.model || null, meta.name || null, now()).run();
  return { token: t, id };
}

// Resolve a phone (`web`) or watch bearer token to a user id. Same checks as auth().
async function userIdFromToken(env, token, kind, touch = false) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare('SELECT user_id,kind,expires,revoked FROM tokens WHERE hash=?').bind(hash).first();
  if (!row || row.expires < now() || row.kind !== kind || row.revoked) return null;
  if (touch) await touchWatch(env, hash);
  return row.user_id;
}

async function auth(req, env, kind) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer ([a-f0-9]{64})$/);
  if (!m) throw new HttpError(401, 'Not signed in');
  const hash = await sha256(m[1]);
  const row = await env.DB.prepare('SELECT user_id,kind,expires,revoked FROM tokens WHERE hash=?').bind(hash).first();
  if (!row || row.expires < now() || row.kind !== kind || row.revoked) throw new HttpError(401, 'Not signed in');
  return { userId: row.user_id, tokenHash: hash };
}
async function touchWatch(env, tokenHash) {
  try { await env.DB.prepare('UPDATE tokens SET last_seen=? WHERE hash=?').bind(now(), tokenHash).run(); } catch (e) { /* pre-0005 */ }
}
function validEmail(e) { return typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

// ---- merge: last-write-wins on the whole blob, but history logs and plans are unioned by id ----
function merge(server, incoming) {
  if (!server) return incoming;
  const win = (incoming.updatedAt || 0) >= (server.updatedAt || 0) ? incoming : server, lose = win === incoming ? server : incoming;
  const out = { ...win };
  const del = new Set([...(win.deleted || []), ...(lose.deleted || [])]);
  const union = (a = [], b = []) => { const m = new Map(); for (const x of b) if (x && x.id) m.set(x.id, x); for (const x of a) if (x && x.id) m.set(x.id, x); return [...m.values()].filter(x => !del.has(x.id)); };
  out.history = union(win.history, lose.history).sort((a, b) => (a.date || 0) - (b.date || 0));
  out.plans = union(win.plans, lose.plans);
  out.deleted = [...del].slice(-2000);
  return out;
}

// ---- watch workout: the web app pre-computes `watchCode` (with its progression logic) on every push ----
const clean = s => String(s || '').replace(/[~,@\/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
function fallbackCode(d) {
  const plan = (d.plans || []).find(p => p.id === d.activePlanId) || (d.plans || [])[0]; if (!plan || !plan.days || !plan.days.length) return null;
  let i = plan.next || 0; for (let k = 0; k < plan.days.length && plan.days[i].rest; k++) i = (i + 1) % plan.days.length;
  const day = plan.days[i]; if (day.rest) return null;
  const toLb = v => Math.round(d.settings && d.settings.units === 'kg' ? (+v || 0) / 0.4536 : (+v || 0));
  const items = (day.exercises || []).filter(e => e.name && e.name.trim()).map(e => [clean(e.name), Math.max(1, Math.min(10, +e.sets || 3)), +e.repMin || 8, toLb(e.weight), Math.round(+e.rest || 90)].join(','));
  return items.length ? ['SL1', clean(day.name) || 'Workout', ...items].join('~') : null;
}

// ---- AI plan features ----
const intVar = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };
const aiOff = (reason) => new HttpError(503, 'AI is not available right now', 'ai_unavailable', reason ? { reason } : undefined);
// Owner alert email (Gmail via sendMail). At most one per reason per 24h (claimed atomically in D1). Never throws, never includes secrets.
const ALERT = {
  credit: ['Simple Lift: xAI credit needs attention', 'xAI refused an AI plan request with a billing, credit or key problem (HTTP {status}). AI plans are off until it is fixed; the app is using its built-in builder.'],
  low: ['Simple Lift: xAI spend at 80% of the cap', 'AI plan spend has reached 80% of your US${cap} cap.'],
  cap: ['Simple Lift: xAI spend cap reached', 'AI plan spend has reached your US${cap} cap, so AI plans are now off and the app is using its built-in builder. Raise AI_SPEND_CAP_USD in wrangler.toml and redeploy to turn them back on.'] };
async function ownerAlert(env, reason, info = {}) {
  try {
    if (!env.OWNER_ALERT_EMAIL || !ALERT[reason]) return false;
    const t = now(), got = await env.DB.prepare('INSERT INTO ai_alerts(reason,sent_at) VALUES(?,?) ON CONFLICT(reason) DO UPDATE SET sent_at=excluded.sent_at WHERE ai_alerts.sent_at<? RETURNING sent_at').bind(reason, t, t - 864e5).first();
    if (!got) return false;
    const sp = await env.DB.prepare('SELECT total_usd_micros,calls FROM ai_spend WHERE id=1').first() || { total_usd_micros: 0, calls: 0 };
    const cap = capMicros(env) / 1e6, [subject, what] = ALERT[reason];
    const text = `${what.replace('{status}', info.status || '?').replace('{cap}', cap)}\n\nSpend so far: US$${(sp.total_usd_micros / 1e6).toFixed(2)} of US$${cap} (${sp.calls} AI calls).\n\nTop up or update payment at https://console.x.ai (Billing > API spend management).\n\nSimple Lift server`;
    try { await (env.SEND_MAIL || sendMail)(env, { to: env.OWNER_ALERT_EMAIL, subject, text }); }
    catch (e) { await env.DB.prepare('DELETE FROM ai_alerts WHERE reason=? AND sent_at=?').bind(reason, t).run(); throw e; } // retry next time
    return true;
  } catch (e) { console.error('owner alert failed: ' + (e && (e.code || e.name))); return false; }
}

// Photo import: accept a data URL or bare base64 (jpeg/png only, as xAI supports), max AI_MAX_IMAGE_BYTES decoded. Never stored or logged.
function checkImage(img, mime) {
  if (typeof img !== 'string' || !img) throw new HttpError(400, 'No image', 'bad_image');
  const m = /^data:([a-z/+.-]+);base64,/i.exec(img);
  let t = String(m ? m[1] : mime || '').toLowerCase(); if (t === 'image/jpg') t = 'image/jpeg';
  if (!IMAGE_MIMES.includes(t)) throw new HttpError(415, 'Use a JPEG or PNG picture', 'bad_image');
  const b64 = (m ? img.slice(m[0].length) : img).replace(/\s+/g, '');
  if (!b64 || b64.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new HttpError(400, 'Invalid image data', 'bad_image');
  const bytes = Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > AI_MAX_IMAGE_BYTES) throw new HttpError(413, 'Picture too large', 'image_too_large');
  const head = atob(b64.slice(0, 16));
  const magic = t === 'image/png' ? head.startsWith('\x89PNG') : head.startsWith('\xff\xd8\xff');
  if (!magic) throw new HttpError(415, 'Picture does not match its type', 'bad_image');
  return 'data:' + t + ';base64,' + b64;
}

async function aiCall(req, env, kind) {
  const a = await auth(req, env, 'web'); await requireVerified(env, a.userId);
  const pu = await env.DB.prepare('SELECT plan FROM users WHERE id=?').bind(a.userId).first();
  if (!pu || pu.plan !== 'paid') throw new HttpError(403, 'AI building is a paid extra; the built-in builder is free.', 'not_paid');
  const b = await body(req, kind === 'image' ? AI_MAX_IMAGE_BODY : 65536);
  let input;
  if (kind === 'plan') input = normAnswers(b.answers);
  else if (kind === 'image') {
    // one picture ({image}) or several ({images:[...]}, max AI_MAX_IMAGES); each is checked on its own
    if (Array.isArray(b.images)) {
      if (!b.images.length) throw new HttpError(400, 'No image', 'bad_image');
      if (b.images.length > AI_MAX_IMAGES) throw new HttpError(413, 'Too many pictures (max ' + AI_MAX_IMAGES + ')', 'too_many_images');
      input = b.images.map(x => checkImage(x, b.mime));
    } else input = [checkImage(b.image, b.mime)];
  }
  else { input = typeof b.text === 'string' ? b.text.slice(0, AI_MAX_TEXT).trim() : ''; if (!input) throw new HttpError(400, 'No text'); }
  if (!env.XAI_API_KEY) throw aiOff();
  const sp = await env.DB.prepare('SELECT total_usd_micros FROM ai_spend WHERE id=1').first();
  const worst = kind === 'image' ? worstImageMicros(env, input.length) : worstMicros(env);
  if ((sp ? sp.total_usd_micros : 0) + worst >= capMicros(env)) { await ownerAlert(env, 'cap'); throw aiOff('budget'); }
  const day = utcDay(), lim = intVar(env.AI_DAILY_LIMIT, 5), glim = intVar(env.AI_GLOBAL_DAILY_LIMIT, 300);
  const inc = k => env.DB.prepare('INSERT INTO ai_usage(user_id,day,count) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1 RETURNING count').bind(k, day).first();
  const limit = () => new HttpError(429, 'Daily AI limit reached', 'limit', { remaining: 0, resetsAt: resetsAt() });
  const u = await inc(a.userId);
  if (u.count > lim) throw limit();
  const g = await inc('*global*');
  if (g.count > glim) { await env.DB.prepare('UPDATE ai_usage SET count=count-1 WHERE user_id=? AND day=?').bind(a.userId, day).run(); throw limit(); }
  const remaining = Math.max(0, lim - u.count);
  const f = env.FETCH || fetch, model = kind === 'image' ? (env.AI_VISION_MODEL || env.AI_MODEL || 'grok-4.3') : (env.AI_MODEL || 'grok-4.3');
  let r, j;
  try {
    r = await f(env.XAI_URL || 'https://api.x.ai/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      headers: { Authorization: 'Bearer ' + env.XAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: AI_MAX_TOKENS, temperature: 0.4, messages: messages(kind, input, aiLang(b.lang)),
        response_format: { type: 'json_schema', json_schema: { name: kind === 'plan' ? 'simple_lift_plan' : 'simple_lift_parse', strict: true, schema: SCHEMA[kind === 'plan' ? 'plan' : 'parse'] } } }) });
    j = await r.json().catch(() => null);
  } catch (e) { console.error('ai fetch failed: ' + (e && e.name)); throw new HttpError(502, 'AI request failed', 'ai_failed', { remaining }); }
  // record spend for every billed response (even if the content is unusable)
  const cost = j && j.usage ? costMicros(j.usage, env) : (r && r.ok ? worst : 0);
  if (cost) {
    const t = await env.DB.prepare('UPDATE ai_spend SET total_usd_micros=total_usd_micros+?,calls=calls+1,updated_at=? WHERE id=1 RETURNING total_usd_micros').bind(cost, now()).first();
    const tot = t ? t.total_usd_micros : 0, cap = capMicros(env);
    if (tot + worst >= cap) await ownerAlert(env, 'cap'); else if (tot >= cap * 0.8) await ownerAlert(env, 'low');
  }
  if (!r.ok) { console.error('ai http ' + r.status); if ([401, 402, 403].includes(r.status) || /credit|balance|billing|payment|permission|quota|spend/i.test(JSON.stringify(j || ''))) await ownerAlert(env, 'credit', { status: r.status }); throw new HttpError(502, 'AI request failed', 'ai_failed', { remaining }); }
  let out;
  try { out = normPlan(JSON.parse(j.choices[0].message.content)); } catch { throw new HttpError(502, 'AI gave an unusable answer', 'ai_failed', { remaining }); }
  const res = { plan: out, ai: true, model, remaining };
  if (kind !== 'plan') { let un = []; try { un = JSON.parse(j.choices[0].message.content).unparsed; } catch { } res.unparsed = (Array.isArray(un) ? un : []).filter(x => typeof x === 'string').slice(0, 30).map(x => x.slice(0, 200)); }
  return res;
}

async function aiStatus(env) {
  const sp = await env.DB.prepare('SELECT total_usd_micros,calls FROM ai_spend WHERE id=1').first() || { total_usd_micros: 0, calls: 0 };
  const t = await env.DB.prepare("SELECT count FROM ai_usage WHERE user_id='*global*' AND day=?").bind(utcDay()).first();
  const cap = capMicros(env);
  return { spent_usd: sp.total_usd_micros / 1e6, cap_usd: cap / 1e6, remaining_usd: Math.max(0, cap - sp.total_usd_micros) / 1e6, calls: sp.calls, today_calls: t ? t.count : 0 };
}
// ---- admin: session user must be verified AND have an email in ADMIN_EMAILS ----
// No default address. Set ADMIN_EMAILS as a secret or a deploy-time var. An empty value means nobody is an admin.
const adminEmails = env => (env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
async function isAdmin(env, userId) { const u = await env.DB.prepare('SELECT email,verified FROM users WHERE id=?').bind(userId).first(); return !!(u && u.verified && adminEmails(env).includes(u.email)); }
async function requireAdmin(req, env) { const a = await auth(req, env, 'web'); if (!(await isAdmin(env, a.userId))) throw new HttpError(403, 'Forbidden', 'forbidden'); return a; }
async function setPlan(req, env, userId) {
  const a = await requireAdmin(req, env);
  const { plan } = await body(req);
  if (plan !== 'free' && plan !== 'paid') throw new HttpError(400, 'plan must be free or paid');
  const u = await env.DB.prepare('SELECT plan FROM users WHERE id=?').bind(userId).first();
  if (!u) throw new HttpError(404, 'No such user');
  await env.DB.batch([env.DB.prepare('UPDATE users SET plan=? WHERE id=?').bind(plan, userId),
    env.DB.prepare('INSERT INTO admin_log(admin_id,user_id,from_plan,to_plan,at) VALUES(?,?,?,?,?)').bind(a.userId, userId, u.plan || 'free', plan, now())]);
  return { ok: true, id: userId, plan };
}

function normPairCode(code) {
  if (typeof code !== 'string' && typeof code !== 'number') return '';
  const digits = String(code).replace(/\D/g, '');
  if (!digits || digits.length > 6) return '';
  return digits.padStart(6, '0');
}
async function livePayload(env, userId, snap) {
  const checkMode = normMode((await readCheckMode(env.DB, userId)) || (snap && snap.mode));
  const out = { snap: snap || null, checkMode };
  const auto = await readAutoDetect(env.DB, userId);
  if (typeof auto === 'boolean') out.autoDetectSets = auto;
  return out;
}
async function liveView(req, env, kind) {
  const a = await auth(req, env, kind);
  if (kind === 'watch') await touchWatch(env, a.tokenHash);
  return livePayload(env, a.userId, await readSnap(env.DB, a.userId));
}
async function liveSave(req, env, kind) {
  const a = await auth(req, env, kind);
  if (kind === 'watch') await touchWatch(env, a.tokenHash);
  const b = await body(req, LIVE_MAX_BODY);
  const snap = validateSnap(b && b.snap);
  const saved = await saveSnap(env.DB, a.userId, snap, serverNow(env));
  return livePayload(env, a.userId, saved);
}

const routes = {
  'GET /auth/me': async (req, env) => {
    const a = await auth(req, env, 'web');
    const u = await env.DB.prepare('SELECT email,verified,plan FROM users WHERE id=?').bind(a.userId).first();
    if (!u) throw new HttpError(401, 'Not signed in');
    return { email: u.email, verified: !!u.verified, plan: u.plan || 'free', admin: await isAdmin(env, a.userId) };
  },
  'GET /admin/users': async (req, env) => {
    await requireAdmin(req, env);
    const q = (new URL(req.url).searchParams.get('q') || '').trim().toLowerCase().slice(0, 100);
    const day = utcDay();
    const rows = (await env.DB.prepare(`SELECT u.id,u.email,u.created,u.verified,u.plan,
      (SELECT count FROM ai_usage WHERE user_id=u.id AND day=?) today, (SELECT SUM(count) FROM ai_usage WHERE user_id=u.id) total
      FROM users u WHERE u.email LIKE ? ESCAPE '\\' ORDER BY u.created DESC LIMIT 500`).bind(day, '%' + q.replace(/[\\%_]/g, c => '\\' + c) + '%').all()).results;
    return { users: rows.map(r => ({ id: r.id, email: r.email, created: r.created, verified: !!r.verified, plan: r.plan || 'free', aiToday: r.today || 0, aiTotal: r.total || 0 })) };
  },
  'GET /admin/ai-status': async (req, env) => { await requireAdmin(req, env); return aiStatus(env); },
  'POST /ai/plan': (req, env) => aiCall(req, env, 'plan'),
  'POST /ai/parse': (req, env) => aiCall(req, env, 'parse'),
  'POST /ai/parse-image': (req, env) => aiCall(req, env, 'image'),
  'GET /ai/budget': async (req, env) => {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
    if (!env.ADMIN_TOKEN || !m || !safeEq(await sha256(m[1]), await sha256(env.ADMIN_TOKEN))) throw new HttpError(404, 'Not found');
    return aiStatus(env);
  },
  'POST /register': async (req, env) => {
    await rateLimit(env, req, 'register');
    const { email, password } = await body(req);
    if (!validEmail(email)) throw new HttpError(400, 'Enter a valid email address');
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw new HttpError(400, 'Password must be 8–200 characters');
    const e = email.trim().toLowerCase();
    if (await env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(e).first()) throw new HttpError(409, 'An account with that email already exists');
    const P = passesFor(env), id = hex(rand(16)), salt = hex(rand(16)), hash = await pbkdf2(password, salt, P);
    const plan = env.DEFAULT_PLAN === 'paid' ? 'paid' : 'free';
    await env.DB.prepare('INSERT INTO users(id,email,salt,hash,iter,created,verified,plan) VALUES(?,?,?,?,?,?,0,?)').bind(id, e, salt, hash, PBKDF2_PASS * P, now(), plan).run();
    const out = { token: await newToken(env, id, 'web'), email: e, verified: false, plan };
    try { await issueCode(env, req, { id, email: e }, 'verify'); } catch (x) { if (x instanceof HttpError) throw x; out.mailError = mailFail(x); }
    return out;
  },
  'POST /login': async (req, env) => {
    await rateLimit(env, req, 'login');
    const { email, password } = await body(req);
    if (!validEmail(email) || typeof password !== 'string' || password.length > 200) throw new HttpError(400, 'Wrong email or password');
    await rateLimit(env, req, 'loginEmail', 'e:' + await sha256(email.trim().toLowerCase())); // per-account limit too
    const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email.trim().toLowerCase()).first();
    const h = await pbkdf2(password, u ? u.salt : '00'.repeat(16), u ? Math.round(u.iter / PBKDF2_PASS) : passesFor(env)); // same work either way
    if (!u || !safeEq(h, u.hash)) throw new HttpError(401, 'Wrong email or password');
    return { token: await newToken(env, u.id, 'web'), email: u.email, verified: !!u.verified, plan: u.plan || 'free' };
  },
  'POST /auth/verify': async (req, env) => {
    await rateLimit(env, req, 'verify');
    const { email, code } = await body(req);
    const u = validEmail(email) ? await env.DB.prepare('SELECT id,verified FROM users WHERE email=?').bind(email.trim().toLowerCase()).first() : null;
    if (u && u.verified) return { ok: true, verified: true };
    await useCode(env, u && u.id, 'verify', normCode(code));
    await env.DB.prepare('UPDATE users SET verified=1 WHERE id=?').bind(u.id).run();
    return { ok: true, verified: true };
  },
  'POST /auth/resend': async (req, env) => {
    const a = await auth(req, env, 'web'); // only the signed-in (unverified) account can ask for another code
    const u = await env.DB.prepare('SELECT id,email,verified FROM users WHERE id=?').bind(a.userId).first();
    if (!u) throw new HttpError(401, 'Not signed in');
    if (u.verified) return { ok: true, verified: true };
    try { await issueCode(env, req, u, 'verify'); } catch (x) { if (x instanceof HttpError) throw x; throw new HttpError(503, 'Could not send the email right now. Try again later.', mailFail(x)); }
    return { ok: true };
  },
  'POST /auth/forgot': async (req, env) => {
    await rateLimit(env, req, 'forgot');
    const { email } = await body(req);
    if (!validEmail(email)) throw new HttpError(400, 'Enter a valid email address');
    const u = await env.DB.prepare('SELECT id,email FROM users WHERE email=?').bind(email.trim().toLowerCase()).first();
    // Same answer whether or not the account exists, and whether or not the mail went out (no account enumeration).
    if (u) try { await issueCode(env, req, u, 'reset'); } catch (x) { if (!(x instanceof HttpError)) mailFail(x); }
    return { ok: true, message: 'If that email has an account, we sent it a 6-digit code.' };
  },
  'POST /auth/reset': async (req, env) => {
    await rateLimit(env, req, 'reset');
    const { email, code, newPassword } = await body(req);
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) throw new HttpError(400, 'Password must be 8–200 characters');
    const u = validEmail(email) ? await env.DB.prepare('SELECT id,email FROM users WHERE email=?').bind(email.trim().toLowerCase()).first() : null;
    await useCode(env, u && u.id, 'reset', normCode(code));
    const P = passesFor(env), salt = hex(rand(16)), hash = await pbkdf2(newPassword, salt, P);
    // reset proves the person owns the email, so it also verifies the account; all old sessions and watch pairings are signed out
    await deleteIfPresent(env, 'DELETE FROM pair_requests WHERE claimed_user_id=?', u.id);
    await deleteIfPresent(env, 'DELETE FROM live_session WHERE user_id=?', u.id);
    await deleteIfPresent(env, 'DELETE FROM watch_settings WHERE user_id=?', u.id);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET salt=?,hash=?,iter=?,verified=1 WHERE id=?').bind(salt, hash, PBKDF2_PASS * P, u.id),
      env.DB.prepare('DELETE FROM tokens WHERE user_id=?').bind(u.id),
      env.DB.prepare('DELETE FROM pairs WHERE user_id=?').bind(u.id)]);
    return { ok: true, token: await newToken(env, u.id, 'web'), email: u.email, verified: true };
  },
  // Permanently delete the signed-in account and everything stored for it. Needs a valid web session, the current
  // password, and the typed confirmation "DELETE". Rows removed: users, tokens (web + watch), data, pairs, results, codes,
  // ai_usage, admin_log, live_session, watch_settings, and pair_requests claimed by this user.
  // Kept: anonymous global AI counters and spend, and IP rate-limit rows that are not keyed by the account.
  'POST /auth/delete-account': async (req, env) => {
    await rateLimit(env, req, 'delacct');
    const a = await auth(req, env, 'web');
    const { password, confirm } = await body(req);
    if (typeof confirm !== 'string' || confirm.trim().toUpperCase() !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm', 'confirm_required');
    const u = await env.DB.prepare('SELECT id,salt,hash,iter FROM users WHERE id=?').bind(a.userId).first();
    if (!u) throw new HttpError(401, 'Not signed in');
    if (typeof password !== 'string' || password.length > 200) throw new HttpError(403, 'Wrong password', 'bad_password');
    const h = await pbkdf2(password, u.salt, Math.round(u.iter / PBKDF2_PASS));
    if (!safeEq(h, u.hash)) throw new HttpError(403, 'Wrong password', 'bad_password');
    const id = u.id;
    await deleteIfPresent(env, 'DELETE FROM pair_requests WHERE claimed_user_id=?', id);
    await deleteIfPresent(env, 'DELETE FROM live_session WHERE user_id=?', id);
    await deleteIfPresent(env, 'DELETE FROM watch_settings WHERE user_id=?', id);
    await env.DB.batch(['tokens', 'data', 'pairs', 'results', 'codes', 'ai_usage', 'admin_log', 'users'].map(t =>
      env.DB.prepare(t === 'users' ? 'DELETE FROM users WHERE id=?' : `DELETE FROM ${t} WHERE user_id=?`).bind(id)));
    return { ok: true, deleted: true };
  },
  'POST /logout': async (req, env) => {
    const a = await auth(req, env, 'web');
    await env.DB.prepare('DELETE FROM tokens WHERE hash=?').bind(a.tokenHash).run();
    return { ok: true };
  },
  'GET /data': async (req, env) => {
    const a = await auth(req, env, 'web'); await requireVerified(env, a.userId);
    const row = await env.DB.prepare('SELECT blob,updated_at,version FROM data WHERE user_id=?').bind(a.userId).first();
    const res = (await env.DB.prepare('SELECT id,code,created FROM results WHERE user_id=? ORDER BY created').bind(a.userId).all()).results;
    const pl = await env.DB.prepare('SELECT plan FROM users WHERE id=?').bind(a.userId).first();
    return { data: row ? JSON.parse(row.blob) : null, updatedAt: row ? row.updated_at : 0, version: row ? row.version : 0, watchResults: res, plan: (pl && pl.plan) || 'free' };
  },
  'PUT /data': async (req, env) => {
    const a = await auth(req, env, 'web'); await requireVerified(env, a.userId);
    const b = await body(req, MAX_BLOB + 1024);
    const d = b.data;
    if (!d || typeof d !== 'object' || !Array.isArray(d.plans) || !Array.isArray(d.history)) throw new HttpError(400, 'Not Simple Lift data');
    d.updatedAt = Math.min(+b.updatedAt || +d.updatedAt || now(), now() + 6e4);
    if (b.watchCode != null && !(typeof b.watchCode === 'string' && /^SL1~/.test(b.watchCode) && b.watchCode.length < 4000)) throw new HttpError(400, 'Bad watch code');
    const row = await env.DB.prepare('SELECT blob,version FROM data WHERE user_id=?').bind(a.userId).first();
    const merged = merge(row ? JSON.parse(row.blob) : null, d);
    if (b.watchCode !== undefined) merged.watchCode = b.watchCode;
    const s = JSON.stringify(merged);
    if (s.length > MAX_BLOB) throw new HttpError(413, 'Your data is over 1 MB');
    const v = (row ? row.version : 0) + 1;
    await env.DB.prepare('INSERT INTO data(user_id,blob,updated_at,version) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET blob=excluded.blob,updated_at=excluded.updated_at,version=excluded.version')
      .bind(a.userId, s, merged.updatedAt || now(), v).run();
    if (Array.isArray(b.ackResults) && b.ackResults.length) {
      const ids = b.ackResults.filter(x => typeof x === 'string').slice(0, 50);
      for (const id of ids) await env.DB.prepare('DELETE FROM results WHERE id=? AND user_id=?').bind(id, a.userId).run();
    }
    const res = (await env.DB.prepare('SELECT id,code,created FROM results WHERE user_id=? ORDER BY created').bind(a.userId).all()).results;
    const pl = await env.DB.prepare('SELECT plan FROM users WHERE id=?').bind(a.userId).first();
    return { data: merged, updatedAt: merged.updatedAt, version: v, watchResults: res, plan: (pl && pl.plan) || 'free' };
  },
  // The watch asks for a code, shows it, and polls; the signed-in phone claims it.
  // Codes stay 6 digits: the phone, the Galaxy Watch, and the Garmin app all show and check that length.
  'POST /pair/request': async (req, env) => {
    await rateLimit(env, req, 'pairreq');
    const b = await body(req);
    const deviceId = typeof b.deviceId === 'string' ? b.deviceId.trim().slice(0, 80) : '';
    if (!deviceId) throw new HttpError(400, 'Missing device id');
    await rateLimit(env, req, 'pairreqDev', 'd:' + deviceId);
    const model = typeof b.model === 'string' ? b.model.trim().slice(0, 80) : '';
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
    await env.DB.prepare("DELETE FROM pair_requests WHERE expires<? OR (device_id=? AND claimed_user_id IS NULL AND watch_token IS NULL)").bind(now(), deviceId).run();
    for (let k = 0; k < 8; k++) {
      const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000, code = String(n).padStart(6, '0');
      try {
        await env.DB.prepare('INSERT INTO pair_requests(code,device_id,model,name,expires,tries,created) VALUES(?,?,?,?,?,0,?)')
          .bind(code, deviceId, model || null, name || null, now() + PAIR_LIFE, now()).run();
        return { code, expiresIn: PAIR_LIFE / 1000 };
      } catch { /* collision */ }
    }
    throw new HttpError(503, 'Try again');
  },
  'POST /pair/status': async (req, env) => {
    const b = await body(req);
    const deviceId = typeof b.deviceId === 'string' ? b.deviceId.trim().slice(0, 80) : '';
    const c = String(b.code == null ? '' : b.code).replace(/\D/g, '').padStart(6, '0');
    if (!deviceId || c.length !== 6) throw new HttpError(400, 'Missing code or device id');
    const p = await env.DB.prepare('SELECT * FROM pair_requests WHERE code=? AND device_id=?').bind(c, deviceId).first();
    if (!p) throw new HttpError(404, 'Code not found');
    if (p.watch_token && p.claimed_user_id) {
      await env.DB.prepare('UPDATE pair_requests SET watch_token=NULL WHERE code=?').bind(c).run();
      return { status: 'claimed', token: p.watch_token };
    }
    if (p.expires < now()) return { status: 'expired' };
    if (p.claimed_user_id) return { status: 'claimed' }; // token already picked up
    return { status: 'pending' };
  },
  // Signed-in phone only. The old unauthenticated claim of a phone-generated /pair/start code is gone:
  // the PWA, the Galaxy Watch, and the Garmin app all use /pair/request plus an authenticated claim.
  'POST /pair/claim': async (req, env) => {
    await rateLimit(env, req, 'claim');
    const a = await auth(req, env, 'web'); await requireVerified(env, a.userId);
    await rateLimit(env, req, 'claimAcct', 'u:' + a.userId);
    const b = await body(req);
    const c = normPairCode(b.code);
    if (!c) throw new HttpError(400, 'Enter the 6-digit code');
    if (await pairFailCount(env, 'acct', a.userId) >= PAIR_FAIL_MAX) throw new HttpError(429, 'Too many wrong tries. Request a new code on the watch.', 'code_locked');
    const p = await env.DB.prepare('SELECT * FROM pair_requests WHERE code=?').bind(c).first();
    const codeFails = await pairFailCount(env, 'code', c);
    const burned = codeFails >= PAIR_FAIL_MAX || !!(p && p.tries >= PAIR_FAIL_MAX);
    // A code the phone already claimed still has to hand the watch its token. Do not delete that row.
    if (burned && p && !p.claimed_user_id) await env.DB.prepare('DELETE FROM pair_requests WHERE code=?').bind(c).run();
    if (!p || p.expires < now() || p.claimed_user_id || burned) {
      if (p && !burned && !p.claimed_user_id) {
        const tries = (p.tries | 0) + 1;
        if (tries >= PAIR_FAIL_MAX) await env.DB.prepare('DELETE FROM pair_requests WHERE code=?').bind(c).run();
        else await env.DB.prepare('UPDATE pair_requests SET tries=? WHERE code=?').bind(tries, c).run();
      }
      const acct = await addPairFail(env, 'acct', a.userId);
      const guessed = await addPairFail(env, 'code', c);
      const rowBurned = !!(p && (p.tries | 0) + 1 >= PAIR_FAIL_MAX);
      if (burned || rowBurned || guessed >= PAIR_FAIL_MAX || acct >= PAIR_FAIL_MAX) throw new HttpError(429, 'Too many wrong tries. Request a new code on the watch.', 'code_locked');
      throw new HttpError(404, 'Code not found or expired', 'bad_code');
    }
    await clearPairFail(env, 'acct', a.userId);
    const { token, id } = await newWatchToken(env, a.userId, { deviceId: p.device_id, model: p.model, name: p.name || p.model });
    await env.DB.prepare('UPDATE pair_requests SET claimed_user_id=?, watch_token=? WHERE code=?').bind(a.userId, token, c).run();
    return { ok: true, watchId: id };
  },
  'GET /watches': async (req, env) => {
    const a = await auth(req, env, 'web');
    const rows = (await env.DB.prepare("SELECT id,device_id,model,name,created,last_seen FROM tokens WHERE user_id=? AND kind='watch' AND (revoked IS NULL OR revoked=0) ORDER BY created").bind(a.userId).all()).results || [];
    return { watches: rows.map(w => ({ id: w.id, deviceId: w.device_id, model: w.model, name: w.name || w.model || null, pairedAt: w.created, lastSeen: w.last_seen })) };
  },
  'POST /watches/remove': async (req, env) => {
    const a = await auth(req, env, 'web');
    const { id } = await body(req);
    if (typeof id !== 'string' || !id) throw new HttpError(400, 'Missing watch id');
    const row = await env.DB.prepare("SELECT hash FROM tokens WHERE id=? AND user_id=? AND kind='watch'").bind(id, a.userId).first();
    if (!row) throw new HttpError(404, 'Watch not found');
    await env.DB.prepare('UPDATE tokens SET revoked=1 WHERE hash=?').bind(row.hash).run();
    return { ok: true };
  },
  'POST /watches/rename': async (req, env) => {
    const a = await auth(req, env, 'web');
    const b = await body(req);
    if (typeof b.id !== 'string' || !b.id) throw new HttpError(400, 'Missing watch id');
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
    if (!name) throw new HttpError(400, 'Enter a name');
    const row = await env.DB.prepare("SELECT hash FROM tokens WHERE id=? AND user_id=? AND kind='watch' AND (revoked IS NULL OR revoked=0)").bind(b.id, a.userId).first();
    if (!row) throw new HttpError(404, 'Watch not found');
    await env.DB.prepare('UPDATE tokens SET name=? WHERE hash=?').bind(name, row.hash).run();
    return { ok: true, name };
  },
  'GET /watch/workout': async (req, env) => {
    const a = await auth(req, env, 'watch');
    await touchWatch(env, a.tokenHash);
    const row = await env.DB.prepare('SELECT blob FROM data WHERE user_id=?').bind(a.userId).first();
    const d = row ? JSON.parse(row.blob) : null;
    const code = d ? (d.watchCode || fallbackCode(d)) : null;
    if (!code) throw new HttpError(404, 'No workout yet. Open Simple Lift on your phone first.');
    const mode = d && d.settings && d.settings.checkMode;
    const checkMode = (mode === 'set' || mode === 'exercise' || mode === 'none') ? mode : 'set';
    const out = { code, checkMode };
    const auto = d && d.settings && d.settings.autoDetectSets;
    if (typeof auto === 'boolean') out.autoDetectSets = auto;
    return attachWatchSettings(out, await readWatchSettingsSafe(env.DB, a.userId));
  },
  'GET /live': (req, env) => liveView(req, env, 'web'),
  'POST /live': (req, env) => liveSave(req, env, 'web'),
  'GET /watch/live': (req, env) => liveView(req, env, 'watch'),
  'POST /watch/live': (req, env) => liveSave(req, env, 'watch'),
  'POST /watch/result': async (req, env) => {
    const a = await auth(req, env, 'watch');
    await touchWatch(env, a.tokenHash);
    const b = await body(req, 8192);
    let code = typeof b === 'string' ? b : b.code;
    if (!code && b.title && Array.isArray(b.ex)) code = ['SR1', clean(b.title), ...b.ex.map(x => `${+x.n | 0}@${(x.w || []).map(v => +v | 0).join('/')}`)].join('~');
    if (typeof code !== 'string' || !/^SR1~[^~]{0,60}(~\d{1,2}@[\d\/]{1,80}){1,30}$/.test(code.replace(/\s+/g, ''))) throw new HttpError(400, 'Bad result code');
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM results WHERE user_id=?').bind(a.userId).first();
    if (n.n >= 50) throw new HttpError(429, 'Too many unsynced results. Open Simple Lift on your phone.');
    const id = hex(rand(12));
    await env.DB.prepare('INSERT INTO results(id,user_id,code,created) VALUES(?,?,?,?)').bind(id, a.userId, code.trim(), now()).run();
    return { ok: true, id };
  },
};


import { ADMIN_HTML } from './admin.js';
import { PRIVACY_HTML, TERMS_HTML, HEALTH_HTML } from './legal.js';
export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    const LEGAL_PAGES = { '/privacy': PRIVACY_HTML, '/terms': TERMS_HTML, '/health': HEALTH_HTML };
    if (req.method === 'GET' && LEGAL_PAGES[path]) return new Response(LEGAL_PAGES[path], { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'Cache-Control': 'public, max-age=3600' } });
    if (path === '/') return json({ ok: true, name: 'Simple Lift API' }, 200, h);
    // v22: country for the app's automatic language pick. Read from Cloudflare's own connection data only; never stored or logged.
    if (req.method === 'GET' && path === '/geo') { const c = String((req.cf && req.cf.country) || req.headers.get('CF-IPCountry') || '').toUpperCase();
      return json({ country: /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : null }, 200, h); }
    if (req.method === 'GET' && path === '/admin') return new Response(ADMIN_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" } });
    try {
      const authFns = {
        userIdFromBearer: token => userIdFromToken(env, token, 'web'),
        userIdFromWatch: token => userIdFromToken(env, token, 'watch', true)
      };
      const settings = await watchSettingsRoutes(req, env, authFns);
      if (settings) return withCors(settings, h);
      const plans = await watchPlanRoutes(req, env, authFns);
      if (plans) return withCors(plans, h);
      const pm = req.method === 'POST' && path.match(/^\/admin\/users\/([a-f0-9]{1,64})\/plan$/);
      const fn = pm ? (rq, e) => setPlan(rq, e, pm[1]) : routes[`${req.method} ${path}`];
      if (!fn) return json({ error: 'Not found' }, 404, h);
      return json(await fn(req, env), 200, h);
    } catch (e) {
      const s = e instanceof HttpError ? e.status : 500;
      if (s === 500) console.error(e);
      return json(s === 500 ? { error: 'Server error' } : e.code ? { error: e.code, message: e.message, ...(e.extra || {}) } : { error: e.message }, s, h);
    }
  },
};
function withCors(res, h) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(h)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}
export { isAdmin, aiCall, ownerAlert, merge, pbkdf2, fallbackCode, sendMail, MailError };
