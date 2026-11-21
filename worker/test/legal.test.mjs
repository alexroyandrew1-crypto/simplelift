// node test/legal.test.mjs — GET /terms, /health, /privacy serve the same legal text as the app, no DB use.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { appLegalPath, stageWorker } from './load-worker.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url)), b = stageWorker(path.join(dir, '.build-legal'));
const W = (await import(pathToFileURL(path.join(b, 'index.mjs')).href)).default;
let n = 0, fail = 0; const ok = (c, m) => { if (c) { n++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const env = { ALLOWED_ORIGIN: 'https://localhost', DB: new Proxy({}, { get() { throw new Error('DB touched'); } }) };
const get = async p => { const r = await W.fetch(new Request('https://a' + p), env); return { s: r.status, h: r.headers, t: await r.text() }; };
for (const [p, re] of [['/terms', /Terms of Use/], ['/health', /Health &amp; Safety Disclaimer/], ['/privacy', /Privacy Policy/]]) {
  const r = await get(p); ok(r.s === 200 && re.test(r.t) && /text\/html/.test(r.h.get('Content-Type')) && /default-src 'none'/.test(r.h.get('Content-Security-Policy')), p + ' served as HTML with strict CSP'); }
const t = (await get('/terms')).t;
for (const re of [/not a medical device/, /assume all known and unknown risks/, /death/, /release, waive and discharge/, /"as is"/, /maximum extent permitted by law/, /indemnify/, /13 years old/, /British Columbia/, /non-refundable/, /xAI/, /Garmin/, /simpleliftsupport@gmail\.com/, /Version 2026-11-21/])
  ok(re.test(t), 'terms contain ' + re);
const h = (await get('/health')).t; ok(/pregnant/.test(h) && /physician/.test(h) && /Stop exercising immediately/.test(h), 'health: physician, pregnancy, stop');
const pr = (await get('/privacy')).t; ok(/does not store or log it/.test(pr) && /simpleliftsupport@gmail\.com/.test(pr) && !/alexroyandrew1@gmail/.test(pr), 'privacy kept, support contact');
const app = fs.readFileSync(appLegalPath(), 'utf8'); const L = JSON.parse(app.slice(app.indexOf('{'), app.lastIndexOf('}') + 1));
ok(t.includes(L.docs.terms.slice(0, 300)) && pr.includes(L.docs.privacy.slice(0, 200)), 'Worker text matches the app');
console.log(`${n} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
