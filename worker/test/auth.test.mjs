// Offline tests for email verification + password reset. D1 is mocked with sql.js (SQLite in WASM), mail with a fake fetch.
// Run: node test/auth.test.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url'; import initSqlJs from 'sql.js';
import { stageWorker } from './load-worker.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.join(dir, '..');
const built = path.join(stageWorker(path.join(dir, '.build')), 'index.mjs');
const W = (await import(pathToFileURL(built).href)).default;
const SQL = await initSqlJs();
const sdb = new SQL.Database();
// old schema first, then the migration, to prove the ALTER works on the existing DB and old users stay verified
const oldSchema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8').replace(/,\n\s*verified[^\n]*\n/, '\n').replace(/CREATE TABLE IF NOT EXISTS codes[\s\S]*$/, '');
sdb.exec(oldSchema);
sdb.run("INSERT INTO users(id,email,salt,hash,iter,created) VALUES('old1','old@example.com','00','x',100000,1)");
sdb.exec(fs.readFileSync(path.join(root, 'migrations/0002_email_codes.sql'), 'utf8'));
sdb.exec(fs.readFileSync(path.join(root, 'migrations/0003_ai.sql'), 'utf8')); sdb.exec(fs.readFileSync(path.join(root, 'migrations/0004_plans_admin.sql'), 'utf8')); sdb.exec(fs.readFileSync(path.join(root, 'migrations/0005_watches.sql'), 'utf8'));
class Stmt { constructor(sql) { this.sql = sql; this.args = []; } bind(...a) { this.args = a; return this; }
  _rows() { const st = sdb.prepare(this.sql); st.bind(this.args); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; }
  async first() { return this._rows()[0] || null; } async all() { return { results: this._rows() }; } async run() { this._rows(); return { success: true }; } }
const DB = { prepare: s => new Stmt(s), batch: async list => { for (const s of list) await s.run(); } };
let mails = [], mailMode = 'ok', logs = [];
const origErr = console.error; console.error = (...a) => logs.push(a.join(' '));
const FETCH = async (url, opt) => {
  if (mailMode === 'down') return new Response('{}', { status: 500 });
  if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
  if (url.includes('gmail')) { const raw = JSON.parse(opt.body).raw.replace(/-/g, '+').replace(/_/g, '/'); const mime = Buffer.from(raw, 'base64').toString();
    const bodyB64 = mime.split('\r\n\r\n')[1]; mails.push({ mime, text: Buffer.from(bodyB64, 'base64').toString(), to: (mime.match(/^To: (.*)$/m) || [])[1] }); return new Response('{}', { status: 200 }); }
  if (url.includes('resend')) { const j = JSON.parse(opt.body); mails.push({ text: j.text, to: j.to[0], from: j.from }); return new Response('{}', { status: 200 }); }
  return new Response('{}', { status: 404 });
};
const gmailEnv = { GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'r', MAIL_FROM: 'simpleliftsupport@gmail.com' };
let env = { DB, PBKDF2_PASSES: '1', ALLOWED_ORIGIN: 'https://localhost', FETCH, ...gmailEnv };
let ip = 1;
const r = async (method, p, b, tok, e = env, ipx) => { const res = await W.fetch(new Request('http://x' + p, { method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ipx || ('10.0.0.' + (ip++ % 250)), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined }), e); return { s: res.status, j: await res.json().catch(() => null) }; };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m); } };
const codeOf = m => (m.text.match(/\b(\d{6})\b/) || [])[1];
const clearRl = () => sdb.run('DELETE FROM rl');
const email = 'new@example.com', pw = 'correct horse 1';

let x = await r('POST', '/register', { email, password: pw });
ok(x.s === 200 && x.j.verified === false && x.j.token, 'register -> unverified + token');
ok(x.j.plan === 'free', 'register without DEFAULT_PLAN returns stored plan (free)');
ok(mails.length === 1 && mails[0].to === email && /^From: Simple Lift <simpleliftsupport@gmail.com>/m.test(mails[0].mime), 'verification email sent from "Simple Lift" via Gmail');
const t = x.j.token, c1 = codeOf(mails[0]);
ok(/^\d{6}$/.test(c1), 'email contains a 6-digit code');
const stored = sdb.exec("SELECT hash FROM codes WHERE purpose='verify'")[0].values[0][0];
ok(stored !== c1 && /^[a-f0-9]{64}$/.test(stored), 'only a hash of the code is stored');
x = await r('GET', '/data', null, t); ok(x.s === 403 && x.j.error === 'unverified', 'unverified: GET /data -> {error:"unverified"}');
x = await r('PUT', '/data', { data: { plans: [], history: [] } }, t); ok(x.s === 403 && x.j.error === 'unverified', 'unverified: PUT /data blocked');
x = await r('POST', '/pair/claim', { code: '123456' }, t); ok(x.s === 403 && x.j.error === 'unverified', 'unverified: pairing blocked');
x = await r('POST', '/login', { email, password: pw }); ok(x.s === 200 && x.j.verified === false, 'unverified account can log in (verified:false)');
x = await r('POST', '/auth/resend', {}, t); ok(x.s === 429, 'resend within 60 s is rate limited');
x = await r('POST', '/auth/verify', { email, code: c1 === '000000' ? '000001' : '000000' }); ok(x.s === 400 && x.j.error === 'bad_code', 'wrong code rejected');
x = await r('POST', '/auth/verify', { email: 'nobody@example.com', code: '123456' }); ok(x.s === 400 && x.j.error === 'bad_code', 'unknown email gives the same error');
x = await r('POST', '/auth/verify', { email: email.toUpperCase(), code: c1 }); ok(x.s === 200 && x.j.verified, 'right code verifies (email case-insensitive)');
x = await r('POST', '/auth/verify', { email, code: c1 }); ok(x.s === 200, 'verify again is harmless');
x = await r('GET', '/data', null, t); ok(x.s === 200, 'verified: /data works');
x = await r('POST', '/pair/request', { deviceId: 'dev-auth', model: 'Forerunner 955' }); const pairCode = x.j && x.j.code;
x = await r('POST', '/pair/claim', { code: pairCode }, t); ok(x.s === 200 && x.j.ok && x.j.watchId, 'verified: pairing works');
x = await r('POST', '/login', { email: 'old@example.com', password: 'whatever1' }); ok(x.s === 401, 'old account row untouched');
ok(sdb.exec("SELECT verified FROM users WHERE id='old1'")[0].values[0][0] === 1, 'existing accounts treated as verified after migration');

// attempts limit + expiry
x = await r('POST', '/register', { email: 'b@example.com', password: pw }); const tb = x.j.token; const cb = codeOf(mails.at(-1));
const wrong = cb === '111111' ? '222222' : '111111';
for (let i = 0; i < 4; i++) await r('POST', '/auth/verify', { email: 'b@example.com', code: wrong });
x = await r('POST', '/auth/verify', { email: 'b@example.com', code: wrong }); ok(x.j.error === 'code_locked', '5th wrong guess locks the code');
x = await r('POST', '/auth/verify', { email: 'b@example.com', code: cb }); ok(x.s === 400, 'locked code no longer works, even when right');
clearRl(); x = await r('POST', '/auth/resend', {}, tb); ok(x.s === 200, 'resend after the wait sends a new code'); const cb2 = codeOf(mails.at(-1));
sdb.run("UPDATE codes SET expires=1 WHERE purpose='verify'");
x = await r('POST', '/auth/verify', { email: 'b@example.com', code: cb2 }); ok(x.s === 400, 'expired code rejected');
// hourly cap: 5 per hour per account
clearRl(); let last; const realNow = Date.now; let fake = realNow();
Date.now = () => fake; for (let i = 0; i < 6; i++) { last = await r('POST', '/auth/resend', {}, tb); fake += 61e3; } Date.now = realNow;
ok(last.s === 429, 'more than 5 codes an hour is rate limited');
x = await r('POST', '/auth/resend', {}); ok(x.s === 401, 'resend needs the signed-in token');

// forgot / reset
clearRl(); const before = mails.length;
x = await r('POST', '/auth/forgot', { email }); const y = await r('POST', '/auth/forgot', { email: 'ghost@example.com' });
ok(x.s === 200 && y.s === 200 && JSON.stringify(x.j) === JSON.stringify(y.j), 'forgot: same answer for real and unknown emails');
ok(mails.length === before + 1 && mails.at(-1).to === email, 'reset code emailed only to the real account');
const rc = codeOf(mails.at(-1));
x = await r('POST', '/auth/forgot', { email }); ok(x.s === 200 && mails.length === before + 1, 'forgot again within 60 s: generic OK, no extra mail');
x = await r('POST', '/auth/reset', { email, code: rc, newPassword: 'short' }); ok(x.s === 400, 'reset: short password rejected (8+ like register)');
x = await r('POST', '/auth/reset', { email, code: rc === '000000' ? '000001' : '000000', newPassword: 'new password 9' }); ok(x.s === 400 && x.j.error === 'bad_code', 'reset: wrong code rejected');
x = await r('POST', '/auth/reset', { email, code: rc, newPassword: 'new password 9' }); ok(x.s === 200 && x.j.token, 'reset with right code');
x = await r('GET', '/data', null, t); ok(x.s === 401, 'reset signs out old sessions');
x = await r('POST', '/login', { email, password: pw }); ok(x.s === 401, 'old password no longer works');
x = await r('POST', '/login', { email, password: 'new password 9' }); ok(x.s === 200 && x.j.verified, 'new password works');
x = await r('POST', '/auth/reset', { email, code: rc, newPassword: 'another pw 1' }); ok(x.s === 400, 'reset code is single-use');

// mail not configured / failing: safe, no codes or addresses in logs
logs = []; const bare = { DB, PBKDF2_PASSES: '1', FETCH };
x = await r('POST', '/register', { email: 'c@example.com', password: pw }, null, bare); ok(x.s === 200 && x.j.mailError === 'mail_not_configured' && x.j.verified === false, 'no mail secrets: account made, clear mailError');
clearRl(); x = await r('POST', '/auth/resend', {}, x.j.token, bare); ok(x.s === 503 && x.j.error === 'mail_not_configured', 'no mail secrets: resend -> 503 mail_not_configured');
x = await r('POST', '/auth/forgot', { email: 'c@example.com' }, null, bare); ok(x.s === 200, 'no mail secrets: forgot still generic');
mailMode = 'down'; x = await r('POST', '/register', { email: 'd@example.com', password: pw }); ok(x.j.mailError === 'mail_failed', 'Gmail down: mailError mail_failed'); mailMode = 'ok';
const allLogs = logs.join('\n'); ok(logs.length > 0 && !/@|\d{6}/.test(allLogs), 'logs have no emails or codes: ' + JSON.stringify(logs));
// resend provider switch
const rEnv = { DB, PBKDF2_PASSES: '1', FETCH, MAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', MAIL_FROM: 'support@simplelift.example' };
x = await r('POST', '/register', { email: 'e@example.com', password: pw }, null, rEnv); ok(x.s === 200 && !x.j.mailError && mails.at(-1).from === 'Simple Lift <support@simplelift.example>', 'MAIL_PROVIDER=resend works as drop-in');
clearRl();
x = await r('POST', '/register', { email: 'paidplan@example.com', password: pw }, null, { ...env, DEFAULT_PLAN: 'paid' });
ok(x.s === 200 && x.j.plan === 'paid', 'register with DEFAULT_PLAN=paid returns stored plan (paid)');
ok(sdb.exec("SELECT plan FROM users WHERE email='paidplan@example.com'")[0].values[0][0] === 'paid', 'paid plan is what was stored');
// privacy text
const pv = await (await W.fetch(new Request('http://x/privacy'), env)).text(); ok(/used only to sign in, to send you a code that verifies your account/.test(pv) && /Forgot password/.test(pv), '/privacy mentions verification and reset');
console.error = origErr; console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
