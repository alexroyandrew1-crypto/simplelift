// Full-flow test against a running `wrangler dev` (default http://127.0.0.1:8787)
const B = process.env.API || 'http://127.0.0.1:8787'; let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const r = async (method, path, body, tok, hdr = {}) => { const t0 = Date.now(); const res = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...hdr }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }); const j = await res.json().catch(() => null); return { s: res.status, j, ms: Date.now() - t0, h: res.headers }; };
const email = process.env.EMAIL || `t${Date.now()}@example.com`, pw = 'correct horse 1';
let x = await r('POST', '/register', { email, password: pw }); ok(x.s === 200 && /^[a-f0-9]{64}$/.test(x.j.token), `register (${x.ms} ms)`); const t1 = x.j.token;
ok(x.j.verified === false, 'new account starts unverified'); x = await r('GET', '/data', undefined, t1); ok(x.s === 403 && x.j.error === 'unverified', 'unverified cannot sync');
// mark verified directly in the local D1 (the emailed-code path is covered offline by test/auth.test.mjs)
(await import('node:child_process')).execSync(`npx wrangler d1 execute simplelift --local --command "UPDATE users SET verified=1 WHERE email='${email}'"`, { stdio: 'ignore' });
x = await r('POST', '/register', { email, password: pw }); ok(x.s === 409, 'duplicate register rejected');
x = await r('POST', '/register', { email: 'bad', password: pw }); ok(x.s === 400, 'bad email rejected');
x = await r('POST', '/register', { email: 'a' + email, password: 'short' }); ok(x.s === 400, 'short password rejected');
x = await r('POST', '/login', { email, password: 'wrong pass' }); ok(x.s === 401, 'wrong password rejected');
x = await r('POST', '/login', { email: email.toUpperCase(), password: pw }); ok(x.s === 200, `login (${x.ms} ms)`); const t2 = x.j.token;
x = await r('GET', '/data', undefined, t2); ok(x.s === 200 && x.j.data === null, 'empty data');
x = await r('GET', '/data'); ok(x.s === 401, 'no token -> 401');
const d1 = { plans: [{ id: 'p1', name: 'P', next: 0, days: [{ name: 'Push', exercises: [{ name: 'Bench Press', sets: 4, repMin: 8, weight: 95, rest: 90 }] }] }], history: [{ id: 'h1', date: 1 }], activePlanId: 'p1', settings: { units: 'lb' } };
x = await r('PUT', '/data', { data: d1, updatedAt: 1000 }, t2); ok(x.s === 200 && x.j.version === 1, 'put data v1');
// other device writes older blob with another log -> union keeps both, newer settings win
x = await r('PUT', '/data', { data: { ...d1, history: [{ id: 'h2', date: 2 }], settings: { units: 'kg' } }, updatedAt: 500 }, t1); ok(x.s === 200 && x.j.data.history.length === 2 && x.j.data.settings.units === 'lb', 'older write merged: logs unioned, newer settings kept');
x = await r('PUT', '/data', { data: { ...d1, history: [{ id: 'h1', date: 1 }], deleted: ['h2'] }, updatedAt: 2000 }, t2); ok(x.j.data.history.length === 1, 'deletion tombstone respected');
x = await r('PUT', '/data', '{"data":' + JSON.stringify({ ...d1, pad: 'x'.repeat(1100000) }) + '}', t2); ok(x.s === 413, 'over 1 MB rejected');
x = await r('GET', '/data', undefined, t1); ok(x.s === 200 && x.j.version === 3, 'get data from device 1');
// pairing
x = await r('POST', '/pair/claim', { code: '000000' }); ok(x.s === 401, 'unauthenticated pair claim rejected');
x = await r('POST', '/pair/request', { deviceId: 'dev-flow', model: 'Forerunner 955' }); ok(x.s === 200 && /^\d{6}$/.test(x.j.code), 'pair request ' + (x.j && x.j.code)); const pc = x.j.code;
x = await r('POST', '/pair/claim', { code: pc }, t2); ok(x.s === 200 && x.j.ok, 'pair claim');
x = await r('POST', '/pair/status', { code: pc, deviceId: 'dev-flow' }); ok(x.s === 200 && x.j.token, 'watch picks up token'); const wt = x.j.token;
x = await r('POST', '/pair/claim', { code: pc }, t2); ok(x.s === 404, 'pair code single-use');
x = await r('GET', '/data', undefined, wt); ok(x.s === 401, 'watch token cannot read /data');
x = await r('GET', '/watch/workout', undefined, t2); ok(x.s === 401, 'web token cannot use watch endpoint');
x = await r('GET', '/watch/workout', undefined, wt); ok(x.s === 200 && x.j.code === 'SL1~Push~Bench Press,4,8,95,90', 'watch workout fallback: ' + (x.j && x.j.code));
await r('PUT', '/data', { data: d1, updatedAt: 3000, watchCode: 'SL1~Push~Bench Press,4,8,100/100/105/105,90' }, t2);
x = await r('GET', '/watch/workout', undefined, wt); ok(x.j.code === 'SL1~Push~Bench Press,4,8,100/100/105/105,90', 'watch workout uses app-computed code');
x = await r('POST', '/watch/result', { code: 'SR1~Push~4@100/100/105/105' }, wt); ok(x.s === 200, 'watch result stored');
x = await r('POST', '/watch/result', { code: 'hello' }, wt); ok(x.s === 400, 'bad result rejected');
x = await r('GET', '/data', undefined, t2); ok(x.j.watchResults.length === 1 && x.j.watchResults[0].code === 'SR1~Push~4@100/100/105/105', 'pending result delivered to app');
await r('PUT', '/data', { data: d1, updatedAt: 4000, ackResults: [x.j.watchResults[0].id] }, t2);
x = await r('GET', '/data', undefined, t2); ok(x.j.watchResults.length === 0, 'result acknowledged and removed');
// CORS
x = await r('OPTIONS', '/data', undefined, null, { Origin: 'https://alexroyandrew1-crypto.github.io' }); ok(x.h.get('access-control-allow-origin') === 'https://alexroyandrew1-crypto.github.io', 'CORS allowed origin');
x = await r('OPTIONS', '/data', undefined, null, { Origin: 'https://evil.example' }); ok(!x.h.get('access-control-allow-origin'), 'CORS other origin refused');
// logout
x = await r('POST', '/logout', {}, t2); ok(x.s === 200, 'logout'); x = await r('GET', '/data', undefined, t2); ok(x.s === 401, 'token dead after logout');
// rate limit on login
let last; for (let i = 0; i < 12; i++) last = await r('POST', '/login', { email, password: 'nope nope' }, null, { 'CF-Connecting-IP': '9.9.9.9' });
ok(last.s === 429, 'login rate-limited after 10 tries');
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
