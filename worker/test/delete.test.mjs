// Offline tests for account deletion + 'erase everywhere' sync semantics. D1 is mocked with sql.js (SQLite in WASM), mail with a fake fetch.
// Run: node test/delete.test.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url'; import initSqlJs from 'sql.js';
import { stageWorker } from './load-worker.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.join(dir, '..');
const built = path.join(stageWorker(path.join(dir, '.build-del')), 'index.mjs');
const W = (await import(pathToFileURL(built).href)).default;
const SQL = await initSqlJs();
const sdb = new SQL.Database();
// old schema first, then the migration, to prove the ALTER works on the existing DB and old users stay verified
const oldSchema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8').replace(/,\n\s*verified[^\n]*\n/, '\n').replace(/CREATE TABLE IF NOT EXISTS codes[\s\S]*$/, '');
sdb.exec(oldSchema);
sdb.run("INSERT INTO users(id,email,salt,hash,iter,created) VALUES('old1','old@example.com','00','x',100000,1)");
sdb.exec(fs.readFileSync(path.join(root, 'migrations/0002_email_codes.sql'), 'utf8'));
sdb.exec(fs.readFileSync(path.join(root, 'migrations/0003_ai.sql'), 'utf8')); sdb.exec(fs.readFileSync(path.join(root, 'migrations/0004_plans_admin.sql'), 'utf8')); sdb.exec(fs.readFileSync(path.join(root, 'migrations/0005_watches.sql'), 'utf8'));
sdb.exec(fs.readFileSync(path.join(root, 'migrations/0006_live_session.sql'), 'utf8')); sdb.exec(fs.readFileSync(path.join(root, 'migrations/0007_watch_settings.sql'), 'utf8'));
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

const n = (t, uid) => sdb.exec(`SELECT COUNT(*) FROM ${t} WHERE user_id='${uid}'`)[0].values[0][0];
const pw = 'correct horse 1';
// two verified users; we delete A and make sure B is untouched
const mk = async (email) => { const x = await r('POST', '/register', { email, password: pw }); sdb.run('UPDATE users SET verified=1 WHERE email=?', [email]); return x.j.token; };
const ta = await mk('a@example.com'), tb = await mk('b@example.com');
const idA = sdb.exec("SELECT id FROM users WHERE email='a@example.com'")[0].values[0][0], idB = sdb.exec("SELECT id FROM users WHERE email='b@example.com'")[0].values[0][0];
let x = await r('PUT', '/data', { data: { plans: [{ id: 'p1', name: 'P', days: [] }], history: [] }, updatedAt: Date.now() }, ta); ok(x.s === 200, 'A synced data');
await r('PUT', '/data', { data: { plans: [{ id: 'q1', name: 'Q', days: [] }], history: [] }, updatedAt: Date.now() }, tb);
x = await r('POST', '/pair/request', { deviceId: 'dev-a', model: 'Forerunner 955' }); const pc = x.j.code;
x = await r('POST', '/pair/claim', { code: pc }, ta); ok(x.s === 200, 'A claimed a watch code');
x = await r('POST', '/pair/status', { code: pc, deviceId: 'dev-a' }); const wt = x.j.token;
await r('POST', '/pair/request', { deviceId: 'dev-a2', model: 'Forerunner 955' }); // a live pairing code row
x = await r('POST', '/watch/result', { code: 'SR1~Push~3@100' }, wt); ok(x.s === 200, 'A has a watch result + watch token');
sdb.run("INSERT INTO ai_usage(user_id,day,count) VALUES(?,?,2)", [idA, '2026-11-03']); sdb.run("INSERT INTO ai_usage(user_id,day,count) VALUES(?,?,1)", [idB, '2026-11-03']);
sdb.run("INSERT INTO ai_usage(user_id,day,count) VALUES('*global*','2026-11-03',3)");
sdb.run("INSERT INTO codes(user_id,purpose,hash,expires) VALUES(?,?,?,?)", [idA, 'reset', 'h', Date.now() + 1e6]);
sdb.run("INSERT INTO admin_log(admin_id,user_id,from_plan,to_plan,at) VALUES('adm',?,'free','paid',1)", [idA]);
sdb.run("INSERT INTO live_session(user_id,rev,snap,updated_at) VALUES(?,?,?,?)", [idA, 1, '{"t":"snap"}', 1]);
sdb.run("INSERT INTO live_session(user_id,rev,snap,updated_at) VALUES(?,?,?,?)", [idB, 2, '{"t":"snap"}', 2]);
sdb.run("INSERT INTO watch_settings(user_id,body,rev) VALUES(?,?,?)", [idA, '{}', 1]);
sdb.run("INSERT INTO watch_settings(user_id,body,rev) VALUES(?,?,?)", [idB, '{}', 2]);
sdb.run("INSERT INTO pair_requests(code,device_id,expires,tries,claimed_user_id,created) VALUES('111111','dev-a',?,0,? ,?)", [Date.now() + 1000, idA, 1]);

x = await r('POST', '/auth/delete-account', { password: pw, confirm: 'DELETE' }); ok(x.s === 401, 'no session -> 401');
x = await r('POST', '/auth/delete-account', { password: pw, confirm: 'DELETE' }, wt); ok(x.s === 401, 'watch token cannot delete the account');
x = await r('POST', '/auth/delete-account', { password: pw }, ta); ok(x.s === 400 && x.j.error === 'confirm_required', 'missing typed confirmation -> 400');
x = await r('POST', '/auth/delete-account', { password: pw, confirm: 'delete it' }, ta); ok(x.s === 400, 'wrong confirmation text -> 400');
x = await r('POST', '/auth/delete-account', { password: 'wrong pass 1', confirm: 'DELETE' }, ta); ok(x.s === 403 && x.j.error === 'bad_password', 'wrong password -> 403 bad_password');
ok(n('data', idA) === 1 && n('tokens', idA) >= 2, 'nothing deleted after failed attempts');
x = await r('POST', '/auth/delete-account', { password: pw, confirm: 'delete' }, ta); ok(x.s === 200 && x.j.deleted, 'right password + "delete" -> deleted');
ok(sdb.exec(`SELECT COUNT(*) FROM users WHERE id='${idA}'`)[0].values[0][0] === 0, 'users row gone');
for (const t of ['tokens', 'data', 'pairs', 'results', 'codes', 'ai_usage', 'admin_log', 'live_session', 'watch_settings']) ok(n(t, idA) === 0, `${t} rows for A gone`);
ok(sdb.exec("SELECT COUNT(*) FROM pair_requests WHERE claimed_user_id='" + idA + "'")[0].values[0][0] === 0, 'pair_requests for A gone');
ok(n('data', idB) === 1 && n('tokens', idB) >= 1 && n('ai_usage', idB) === 1, 'other user B untouched');
ok(n('ai_usage', '*global*') === 1, 'anonymous global AI counter kept');
x = await r('GET', '/data', null, ta); ok(x.s === 401, 'old session no longer works');
x = await r('GET', '/watch/workout', null, wt); ok(x.s === 401, 'watch token no longer works');
x = await r('POST', '/login', { email: 'a@example.com', password: pw }); ok(x.s === 401, 'cannot log in after deletion');
x = await r('POST', '/register', { email: 'a@example.com', password: pw }); ok(x.s === 200, 'email can sign up again (fresh account)');
x = await r('GET', '/data', null, tb); ok(x.s === 200 && x.j.data.plans[0].id === 'q1', 'B still syncs');
const pv = await (await W.fetch(new Request('http://x/privacy'), env)).text(); ok(/Settings → Account &amp; sync → Delete account/.test(pv), '/privacy explains in-app deletion');
ok(/live workout snapshot/.test(pv) && /device id/.test(pv) && /Galaxy Watch/.test(pv) && /heart rate/.test(pv) && !/Nothing is kept/.test(pv), 'privacy names the live snapshot, watch details, and Galaxy heart rate');

sdb.run("INSERT INTO pair_requests(code,device_id,expires,tries,claimed_user_id,created) VALUES('222222','dev-b',?,0,?,?)", [Date.now() + 1000, idB, 1]);
sdb.run('DELETE FROM rl');
mails.length = 0;
x = await r('POST', '/auth/forgot', { email: 'b@example.com' });
const resetCode = (mails.at(-1).text.match(/\b(\d{6})\b/) || [])[1];
x = await r('POST', '/auth/reset', { email: 'b@example.com', code: resetCode, newPassword: 'correct horse 2' });
ok(x.s === 200 && x.j.token, 'reset returns a new token');
ok(n('live_session', idB) === 0 && n('watch_settings', idB) === 0, 'reset deletes the live snapshot and watch settings');
ok(sdb.exec("SELECT COUNT(*) FROM pair_requests WHERE claimed_user_id='" + idB + "'")[0].values[0][0] === 0, 'reset deletes claimed watch codes');
ok(n('tokens', idB) === 1 && n('data', idB) === 1, 'reset signs out old sessions and keeps saved plans');

// "Erase everywhere" from the app: a blank blob with tombstones for every id and a newer updatedAt must not be resurrected by the merge
const { merge } = await import(pathToFileURL(built).href);
const server = { updatedAt: 100, settings: { units: 'kg' }, plans: [{ id: 'p1' }, { id: 'p2' }], history: [{ id: 'h1', date: 1 }], deleted: [] };
const wiped = { updatedAt: 200, settings: { units: 'lb' }, plans: [], history: [], activePlanId: null, deleted: ['p1', 'p2', 'h1'] };
const m = merge(server, wiped); ok(m.plans.length === 0 && m.history.length === 0 && m.settings.units === 'lb', 'erase-everywhere wins over the server copy');
const stale = merge(server, { updatedAt: 0, plans: [], history: [] }); ok(stale.plans.length === 2 && stale.history.length === 1, '(why) a plain local reset with updatedAt 0 would be resurrected');
console.error = origErr; console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
