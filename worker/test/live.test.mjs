// Live snapshot: 64 KB cap, format checks, server-assigned rev, JSON errors with CORS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import initSqlJs from 'sql.js';
import { stageWorker } from './load-worker.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const built = path.join(stageWorker(path.join(dir, '.build-live')), 'index.mjs');
const W = (await import(pathToFileURL(built).href)).default;
const SQL = await initSqlJs();
const sdb = new SQL.Database();
sdb.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
sdb.exec(fs.readFileSync(path.join(root, 'migrations/0004_plans_admin.sql'), 'utf8'));
sdb.exec(fs.readFileSync(path.join(root, 'migrations/0005_watches.sql'), 'utf8'));

class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  _rows() {
    const st = sdb.prepare(this.sql);
    st.bind(this.args);
    const out = [];
    while (st.step()) out.push(st.getAsObject());
    st.free();
    return out;
  }
  async first() { return this._rows()[0] || null; }
  async all() { return { results: this._rows() }; }
  async run() { this._rows(); return { success: true }; }
}
const DB = { prepare: s => new Stmt(s), batch: async list => { for (const s of list) await s.run(); } };
const FETCH = async () => new Response('{}', { status: 200 });
const env = {
  DB, PBKDF2_PASSES: '1', ALLOWED_ORIGIN: 'https://localhost', FETCH, now: () => 1_700_000_000_000,
  GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'r', MAIL_FROM: 'simpleliftsupport@gmail.com'
};
let ip = 1;
const call = async (method, p, b, tok, extraHeaders) => {
  const res = await W.fetch(new Request('http://x' + p, {
    method,
    headers: {
      'Content-Type': 'application/json', Origin: 'https://localhost', 'CF-Connecting-IP': '10.9.0.' + (ip++ % 200),
      ...(tok ? { Authorization: 'Bearer ' + tok } : {}),
      ...(extraHeaders || {})
    },
    body: b === undefined ? undefined : (typeof b === 'string' ? b : JSON.stringify(b))
  }), env);
  const text = await res.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch { j = text; }
  return { s: res.status, j, h: res.headers, text };
};
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m); } };

const pw = 'correct horse 1';
let x = await call('POST', '/register', { email: 'live@example.com', password: pw });
const web = x.j.token;
sdb.run("UPDATE users SET verified=1 WHERE email='live@example.com'");
x = await call('POST', '/pair/request', { deviceId: 'dev-live', model: 'Galaxy Watch' });
const code = x.j.code;
await call('POST', '/pair/claim', { code }, web);
x = await call('POST', '/pair/status', { code, deviceId: 'dev-live' });
const watch = x.j.token;

const snap = { t: 'snap', id: 'sess1', rev: 7, src: 'p', at: 100, mode: 'set', ex: [{ n: 'Bench', rest: 90, s: [{ w: 135, r: 8, d: 1, u: 'kg', v: 61.25, hr: 140 }] }] };
x = await call('POST', '/live', { snap });
ok(x.s === 401 && x.j.error === 'Not signed in' && x.h.get('access-control-allow-origin') === 'https://localhost', 'live requires a session and still sends CORS');

x = await call('POST', '/live', { snap: { t: 'nope', id: 'sess1' } }, web);
ok(x.s === 400 && x.j.error === 'bad_snap', 'bad snapshot shape is rejected');

x = await call('POST', '/live', '{', web);
ok(x.s === 400, 'invalid JSON is rejected');

x = await call('POST', '/live', { snap: { ...snap, id: 'bad id' } }, web);
ok(x.s === 400 && x.j.error === 'bad_snap', 'id must be a short token');

const big = JSON.stringify({ snap: { ...snap, code: 'x'.repeat(70 * 1024) } });
x = await call('POST', '/live', big, web);
ok(x.s === 413, 'body over 64 KB is rejected');

x = await call('POST', '/live', { snap }, web);
ok(x.s === 200 && x.j.snap && x.j.snap.rev === 1700000000 && x.j.snap.rev !== 7, 'server assigns rev ' + (x.j && x.j.snap && x.j.snap.rev));
ok(x.j.snap.ex[0].n === 'Bench' && x.j.checkMode === 'set', 'stored snapshot keeps the set');
ok(x.j.snap.ex[0].s[0].u === 'kg' && x.j.snap.ex[0].s[0].v === 61.25 && x.j.snap.ex[0].s[0].w === 135 && x.j.snap.ex[0].s[0].hr == null, 'exact kg is kept and unknown fields stay dropped');

env.now = () => 1_700_000_000_000;
x = await call('POST', '/live', { snap: { ...snap, rev: 2147483647, ex: [{ n: 'Row', s: [{ w: 50, r: 10, d: 0 }] }] } }, web);
ok(x.s === 200 && x.j.snap.rev === 1700000001 && x.j.snap.ex[0].n === 'Row', 'a huge client rev cannot pin the row');

x = await call('GET', '/live', undefined, web);
ok(x.s === 200 && x.j.snap.ex[0].n === 'Row' && x.j.snap.rev === 1700000001, 'GET returns the server snapshot');

x = await call('POST', '/watch/live', { snap: { ...snap, src: 'w', id: 'sess1' } }, watch);
ok(x.s === 200 && x.j.snap.rev === 1700000002 && x.j.snap.src === 'w', 'watch token can post the same snapshot');

x = await call('POST', '/watch/live', { snap }, web);
ok(x.s === 401, 'phone token cannot post to the watch route');

x = await call('GET', '/watch/plans', undefined, watch);
ok(x.s === 200 && Array.isArray(x.j.plans), 'watch plans route answers');

await call('PUT', '/data', { data: { plans: [], history: [], settings: { units: 'lb', checkMode: 'exercise', autoDetectSets: false } }, updatedAt: Date.now() }, web);
x = await call('GET', '/live', undefined, web);
ok(x.s === 200 && x.j.checkMode === 'exercise' && x.j.autoDetectSets === false, 'check mode and auto-detect come from the account blob');

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
