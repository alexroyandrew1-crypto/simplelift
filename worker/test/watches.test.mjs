// Offline tests for v31 multi-watch pairing. D1 mocked with sql.js. Run: node test/watches.test.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url'; import initSqlJs from 'sql.js';
import { stageWorker } from './load-worker.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.join(dir, '..');
const b = stageWorker(path.join(dir, '.build-watches'));
const W = (await import(pathToFileURL(path.join(b, 'index.mjs')).href)).default;
const SQL = await initSqlJs();
const sdb = new SQL.Database();
sdb.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
sdb.exec(fs.readFileSync(path.join(root, 'migrations/0004_plans_admin.sql'), 'utf8'));
sdb.exec(fs.readFileSync(path.join(root, 'migrations/0005_watches.sql'), 'utf8'));
class Stmt { constructor(sql) { this.sql = sql; this.args = []; } bind(...a) { this.args = a; return this; }
  _rows() { const st = sdb.prepare(this.sql); st.bind(this.args); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; }
  async first() { return this._rows()[0] || null; } async all() { return { results: this._rows() }; } async run() { this._rows(); return { success: true }; } }
const DB = { prepare: s => new Stmt(s), batch: async list => { for (const s of list) await s.run(); } };
const FETCH = async (url, opt) => {
  if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
  if (url.includes('gmail') || url.includes('resend')) return new Response('{}', { status: 200 });
  return new Response('{}', { status: 404 });
};
const env = { DB, PBKDF2_PASSES: '1', ALLOWED_ORIGIN: 'https://localhost', FETCH, GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'r', MAIL_FROM: 'simpleliftsupport@gmail.com' };
let ip = 1;
const r = async (method, p, b, tok) => {
  const res = await W.fetch(new Request('http://x' + p, { method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.1.0.' + (ip++ % 250), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined }), env);
  return { s: res.status, j: await res.json().catch(() => null) };
};
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m); } };

const email = 'watch@example.com', pw = 'correct horse 1';
let x = await r('POST', '/register', { email, password: pw });
ok(x.s === 200 && x.j.token, 'register');
const web = x.j.token;
sdb.run("UPDATE users SET verified=1 WHERE email='watch@example.com'");

// Watch requests a code (no auth)
x = await r('POST', '/pair/request', { deviceId: 'dev-955', model: 'Forerunner 955', name: 'My 955' });
ok(x.s === 200 && /^\d{6}$/.test(x.j.code) && x.j.expiresIn === 600, 'watch requests code: ' + (x.j && x.j.code));
const code = x.j.code;

x = await r('POST', '/pair/status', { code, deviceId: 'dev-955' });
ok(x.s === 200 && x.j.status === 'pending', 'status pending before claim');

x = await r('POST', '/pair/status', { code, deviceId: 'other-device' });
ok(x.s === 404, 'status rejects other device');

// Phone claims with account token
x = await r('POST', '/pair/claim', { code }, web);
ok(x.s === 200 && x.j.ok && x.j.watchId, 'phone claims code');

x = await r('POST', '/pair/claim', { code }, web);
ok(x.s === 404, 'code is single-use');

x = await r('POST', '/pair/status', { code, deviceId: 'dev-955' });
ok(x.s === 200 && x.j.status === 'claimed' && /^[a-f0-9]{64}$/.test(x.j.token), 'watch picks up token');
const wt = x.j.token;

x = await r('POST', '/pair/status', { code, deviceId: 'dev-955' });
ok(x.s === 200 && x.j.status === 'claimed' && !x.j.token, 'token delivered only once');

// A second watch uses the same request/claim flow. /pair/start is not a route anymore.
x = await r('POST', '/pair/start', {}, web);
ok(x.s === 404, 'legacy pair start is gone');
x = await r('POST', '/pair/claim', { code: '000000' });
ok(x.s === 401, 'unauthenticated claim is rejected');
x = await r('POST', '/pair/request', { deviceId: 'dev-2', model: 'Galaxy Watch', name: 'Wrist' });
const code2 = x.j.code;
x = await r('POST', '/pair/claim', { code: code2 }, web);
ok(x.s === 200 && x.j.ok, 'second watch claimed');
x = await r('POST', '/pair/status', { code: code2, deviceId: 'dev-2' });
ok(x.s === 200 && x.j.token, 'second watch token');
const wt2 = x.j.token;

// List
x = await r('GET', '/watches', null, web);
ok(x.s === 200 && x.j.watches.length === 2, 'lists both watches');
ok(x.j.watches.some(w => w.model === 'Forerunner 955' && w.name === 'My 955' && w.id), 'new watch has model and name');
const id1 = x.j.watches.find(w => w.model === 'Forerunner 955').id;

// Watch endpoints accept either token
x = await r('GET', '/watch/workout', null, wt);
ok(x.s === 404 || x.s === 200, 'new watch token accepted (404 = no workout yet is ok): ' + x.s);
x = await r('GET', '/watch/workout', null, wt2);
ok(x.s === 404 || x.s === 200, 'legacy watch token accepted: ' + x.s);

// Remove only the first watch
x = await r('POST', '/watches/remove', { id: id1 }, web);
ok(x.s === 200 && x.j.ok, 'remove one watch');
x = await r('GET', '/watch/workout', null, wt);
ok(x.s === 401, 'revoked watch token is rejected');
x = await r('GET', '/watch/workout', null, wt2);
ok(x.s === 404 || x.s === 200, 'other watch still valid: ' + x.s);
x = await r('GET', '/watches', null, web);
ok(x.s === 200 && x.j.watches.length === 1 && x.j.watches[0].id !== id1, 'removed watch gone from list');

// Rename
const id2 = x.j.watches[0].id;
x = await r('POST', '/watches/rename', { id: id2, name: 'Kitchen Garmin' }, web);
ok(x.s === 200 && x.j.name === 'Kitchen Garmin', 'rename');
x = await r('GET', '/watches', null, web);
ok(x.j.watches[0].name === 'Kitchen Garmin', 'rename visible in list');

// Unverified cannot claim
const e2 = 'unv@example.com';
x = await r('POST', '/register', { email: e2, password: pw });
const unv = x.j.token;
x = await r('POST', '/pair/request', { deviceId: 'dev-unv', model: 'Forerunner 955' });
const c3 = x.j.code;
x = await r('POST', '/pair/claim', { code: c3 }, unv);
ok(x.s === 403, 'unverified cannot claim');

// Missing device id
x = await r('POST', '/pair/request', { model: 'Forerunner 955' });
ok(x.s === 400, 'request requires device id');

// Wrong guesses are counted per account and per code. Five failures burn the code and lock the account.
const e3 = 'guess@example.com';
x = await r('POST', '/register', { email: e3, password: pw });
const guesser = x.j.token;
sdb.run("UPDATE users SET verified=1 WHERE email=?", [e3]);
x = await r('POST', '/pair/request', { deviceId: 'dev-guess', model: 'Forerunner 955' });
const real = x.j.code;
for (let i = 0; i < 4; i++) {
  x = await r('POST', '/pair/claim', { code: '99999' + i }, guesser);
  ok(x.s === 404 && x.j.error === 'bad_code', 'wrong code ' + (i + 1) + ' is a miss');
}
x = await r('POST', '/pair/claim', { code: real }, guesser);
ok(x.s === 200 && x.j.ok, 'the real code still works after four misses');
x = await r('POST', '/pair/request', { deviceId: 'dev-guess', model: 'Forerunner 955' });
const burn = x.j.code;
sdb.run('UPDATE pair_requests SET expires=1 WHERE code=?', [burn]);
for (let i = 0; i < 5; i++) await r('POST', '/pair/claim', { code: burn }, guesser);
ok(sdb.exec("SELECT COUNT(*) FROM pair_requests WHERE code='" + burn + "'")[0].values[0][0] === 0, 'five failures delete that code');
x = await r('POST', '/pair/claim', { code: burn }, guesser);
ok(x.s === 429 && x.j.error === 'code_locked', 'the account is locked after repeated misses');
const e4 = 'other@example.com';
x = await r('POST', '/register', { email: e4, password: pw });
const other = x.j.token;
sdb.run("UPDATE users SET verified=1 WHERE email=?", [e4]);
x = await r('POST', '/pair/request', { deviceId: 'dev-other', model: 'Galaxy Watch' });
const otherCode = x.j.code;
x = await r('POST', '/pair/claim', { code: otherCode }, other);
ok(x.s === 200 && x.j.ok, 'a different account can still pair');

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
