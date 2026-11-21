// Offline test: /data is strictly scoped to the session user (two users never see each other). Run: node test/isolation.test.mjs
// Run: node test/delete.test.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url'; import initSqlJs from 'sql.js';
import { stageWorker } from './load-worker.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.join(dir, '..');
const built = path.join(stageWorker(path.join(dir, '.build-iso')), 'index.mjs');
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

const n = (t, uid) => sdb.exec(`SELECT COUNT(*) FROM ${t} WHERE user_id='${uid}'`)[0].values[0][0];
const pw = 'correct horse 1';
// two verified users; we delete A and make sure B is untouched
const mk = async (email) => { const x = await r('POST', '/register', { email, password: pw }); sdb.run('UPDATE users SET verified=1 WHERE email=?', [email]); return x.j.token; };
const A = await mk('usera@test.dev'), B = await mk('userb@test.dev');
const wA = { version: 1, plans: [{ id: 'pa', name: 'A plan', days: [] }], history: [{ id: 'ha', date: 1, exercises: [] }], updatedAt: Date.now() };
let x = await r('GET', '/data', null, B); ok(x.s === 200 && x.j.data === null, 'new user B starts empty');
x = await r('PUT', '/data', { data: wA, updatedAt: wA.updatedAt }, A); ok(x.s === 200 && x.j.data.history.length === 1, 'A saves 1 workout');
x = await r('GET', '/data', null, B); ok(x.j.data === null, 'B still empty after A saves');
x = await r('PUT', '/data', { data: { version: 1, plans: [], history: [{ id: 'hb', date: 2, exercises: [] }], updatedAt: Date.now() + 5 } }, B);
ok(x.j.data.history.map(h => h.id).join() === 'hb' && x.j.data.plans.length === 0, 'B PUT response holds only B data');
x = await r('GET', '/data', null, A); ok(x.j.data.history.map(h => h.id).join() === 'ha', 'A sees only A data');
x = await r('GET', '/data', null, B); ok(x.j.data.history.map(h => h.id).join() === 'hb', 'B sees only B data');
x = await r('GET', '/data', null, null); ok(x.s === 401, 'no token -> 401');
x = await r('GET', '/data', null, 'f'.repeat(64)); ok(x.s === 401, 'bogus token -> 401');
await r('POST', '/logout', {}, A); x = await r('GET', '/data', null, A); ok(x.s === 401, 'logged-out token rejected');
{ const t = (await r('POST', '/register', { email: 'paidnew@test.dev', password: pw }, null, { ...env, DEFAULT_PLAN: 'paid' })).j; ok(t && sdb.exec("SELECT plan FROM users WHERE email='paidnew@test.dev'")[0].values[0][0] === 'paid', 'DEFAULT_PLAN=paid -> new account paid'); const f = (await r('POST', '/register', { email: 'freenew@test.dev', password: pw })).j; ok(sdb.exec("SELECT plan FROM users WHERE email='freenew@test.dev'")[0].values[0][0] === 'free', 'no DEFAULT_PLAN -> free'); }
console.error = origErr; console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
