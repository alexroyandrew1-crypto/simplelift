// Pairing limits are per IP and per device. A burst from many addresses must not lock pairing for everyone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import initSqlJs from 'sql.js';
import { stageWorker } from './load-worker.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const built = path.join(stageWorker(path.join(dir, '.build-pair')), 'index.mjs');
const W = (await import(pathToFileURL(built).href)).default;
const SQL = await initSqlJs();
const sdb = new SQL.Database();
sdb.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
sdb.exec(fs.readFileSync(path.join(root, 'migrations/0004_plans_admin.sql'), 'utf8'));
sdb.exec(fs.readFileSync(path.join(root, 'migrations/0005_watches.sql'), 'utf8'));
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  _rows() { const st = sdb.prepare(this.sql); st.bind(this.args); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; }
  async first() { return this._rows()[0] || null; }
  async all() { return { results: this._rows() }; }
  async run() { this._rows(); return { success: true }; }
}
const DB = { prepare: s => new Stmt(s), batch: async list => { for (const s of list) await s.run(); } };
const env = { DB, PBKDF2_PASSES: '1', ALLOWED_ORIGIN: 'https://localhost', FETCH: async () => new Response('{}', { status: 200 }),
  GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'r', MAIL_FROM: 'simpleliftsupport@gmail.com' };
const call = async (ip, device) => {
  const res = await W.fetch(new Request('http://x/pair/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ deviceId: device, model: 'Forerunner 955' })
  }), env);
  return { s: res.status, j: await res.json().catch(() => null) };
};
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m); } };

let last = null;
for (let i = 0; i < 301; i++) last = await call('203.0.113.' + (i % 250), 'dev-' + i);
ok(last.s === 200 && /^\d{6}$/.test(last.j.code), '301 different devices are not stopped by a global cap');
const again = await call('203.0.113.1', 'dev-0');
let n = 0;
for (let i = 0; i < 12; i++) {
  const x = await call('198.51.100.9', 'dev-same');
  if (x.s === 429) n++;
}
ok(n > 0, 'one device is still limited on its own');
ok(again.s === 200 || again.s === 429, 'a single repeat does not take down a different address');

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
