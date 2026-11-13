// Check-off modes: picker, each layout, rest, and the sets that land in history.
// Also writes the mobile screenshots under docs/screenshots/check-mode/.
import {createRequire} from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {execFileSync} from 'child_process';
import {fileURLToPath} from 'url';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS = path.join(ROOT, 'docs/screenshots/check-mode');
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';
const BEFORE = '/tmp/sl-v33-before';

const PLAN = {
  id:'p1', name:'Test Plan', created:1, next:0,
  days:[{id:'d1', name:'Push', rest:false, color:'#4ade80', exercises:[
    {id:'e1', name:'Bench Press', sets:3, repMin:8, repMax:10, weight:135, rest:90, note:''},
    {id:'e2', name:'Row', sets:2, repMin:10, repMax:12, weight:95, rest:60, note:''}
  ]}]
};

let failed = 0;
function check(cond, msg) {
  if (!cond) { failed++; console.error('FAIL:', msg); }
  else console.log('ok:', msg);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve(root, port) {
  const server = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/') u = '/index.html';
    const file = path.join(root, u);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('no'); return;
    }
    const ext = path.extname(file);
    const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
    res.writeHead(200, {'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}

async function openApp(browser, port, lang) {
  const page = await browser.newPage();
  await page.setViewport({width: 390, height: 844, deviceScaleFactor: 2});
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:' + port + '/', {waitUntil: 'domcontentloaded'});
  await page.evaluate((plan, lang) => {
    localStorage.setItem('simplelift_terms', JSON.stringify({v: '2026-11-11', at: new Date().toISOString()}));
    localStorage.setItem('simplelift_lang', lang);
    localStorage.setItem('simplelift_lang_toast', lang);
    const db = {version:1, settings:{units:'lb', unitsChosen:true}, plans:[plan], activePlanId:plan.id, history:[], active:null, updatedAt:1};
    if (window.Store) { Store.reset(); Object.assign(Store.db, db); Store.db.active = null; Store.save(); }
    else localStorage.setItem('simplelift_v1', JSON.stringify(db));
  }, PLAN, lang);
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#title') && document.body.innerText.length > 20);
  await sleep(400);
  return page;
}

async function shot(page, name) {
  await page.screenshot({path: path.join(SHOTS, name), fullPage: false});
  console.log('shot', name);
}

async function main() {
  fs.mkdirSync(SHOTS, {recursive: true});
  if (!fs.existsSync(path.join(BEFORE, 'index.html'))) {
    execFileSync('git', ['worktree', 'add', '--detach', BEFORE, 'origin/main'], {cwd: ROOT, stdio: 'inherit'});
  }
  const beforeSrv = await serve(BEFORE, 8771);
  const afterSrv = await serve(ROOT, 8772);
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'sl-cm-')),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const before = await openApp(browser, 8771, 'en');
  await before.waitForSelector('[data-act="start"]');
  check(!(await before.$('#modePicker')), 'v33 start screen has no check-off picker');
  await shot(before, 'before-start.png');
  await before.click('[data-act="start"]');
  await before.waitForSelector('[data-act="setDone"]');
  await shot(before, 'before-session.png');
  await before.close();

  const page = await openApp(browser, 8772, 'en');
  await page.waitForSelector('#modePicker');
  const labels = await page.$$eval('#modePicker button', bs => bs.map(b => b.textContent.trim()));
  check(labels.join('|') === 'Check each set|Check each exercise|No checks', 'three modes on the start screen: ' + labels.join('|'));
  check(await page.$eval('#modePicker button[data-v="set"]', b => b.getAttribute('aria-pressed')) === 'true', 'each set is the default');
  await shot(page, 'after-start.png');

  await page.click('#modePicker button[data-v="exercise"]');
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#modePicker');
  check(await page.$eval('#modePicker button[data-v="exercise"]', b => b.getAttribute('aria-pressed')) === 'true', 'last choice is remembered');
  await page.click('#modePicker button[data-v="set"]');

  await page.click('[data-act="start"]');
  await page.waitForSelector('[data-act="setDone"]');
  const setCount = await page.$$eval('[data-act="setDone"]', ns => ns.length);
  check(setCount === 5 && !(await page.$('[data-act="exDone"]')), 'set mode keeps a check on every row');
  await shot(page, 'mode-set.png');
  await page.click('[data-act="setDone"][data-j="0"][data-k="0"]');
  await sleep(200);
  const afterOne = await page.evaluate(() => {
    const a = Store.db.active;
    const timer = !!document.querySelector('#timer');
    return { done: a.exercises[0].sets.map(s => s.done), timer, mode: a.checkMode };
  });
  check(afterOne.done[0] === true && afterOne.done[1] === false && afterOne.timer, 'checking one set starts rest and leaves the others open');

  await page.click('#modePicker button[data-v="exercise"]');
  await page.waitForSelector('[data-act="exDone"]');
  const laid = await page.evaluate(() => {
    const card = document.querySelector('.ex-card');
    const title = card.querySelector('h3').getBoundingClientRect();
    const btn = card.querySelector('[data-act="exDone"]').getBoundingClientRect();
    const stepper = !!card.querySelector('[data-bind="set.0.0.w"]');
    const rowChecks = card.querySelectorAll('[data-act="setDone"]').length;
    return { btnRight: btn.left > title.right - 8, stepper, rowChecks, big: btn.width >= 52 };
  });
  check(laid.stepper && laid.rowChecks === 0 && laid.big && laid.btnRight, 'exercise mode: large check by the header, steppers stay, row checks hidden');
  await shot(page, 'mode-exercise.png');
  await page.evaluate(() => {
    const w = document.querySelector('[data-bind="set.1.0.w"]');
    w.value = '105';
    w.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await page.click('[data-act="exDone"][data-j="1"]');
  await sleep(250);
  const ex = await page.evaluate(() => {
    const e = Store.db.active.exercises[1];
    return { sets: e.sets.map(s => ({w: s.w, r: s.r, done: s.done})), timer: !!document.querySelector('#timer') };
  });
  check(ex.sets.every(s => s.done && s.w === 105 && s.r === 10) && ex.timer, 'exercise check logs every set with the weight and reps shown and starts rest');

  await page.click('#modePicker button[data-v="none"]');
  await sleep(100);
  const noneUi = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.ex-card .settools')];
    const laid = rows.map(row => {
      const add = row.querySelector('[data-act="setAdd"]').getBoundingClientRect();
      const rest = row.querySelector('[data-act="restGo"]').getBoundingClientRect();
      const card = row.closest('.ex-card').getBoundingClientRect();
      return {
        sameRow: Math.abs(add.top - rest.top) < 8,
        end: document.documentElement.dir === 'rtl' ? rest.left < add.left : rest.left > add.left,
        flush: document.documentElement.dir === 'rtl' ? rest.left - card.left < 24 : card.right - rest.right < 24
      };
    });
    return {
      checks: document.querySelectorAll('[data-act="setDone"], [data-act="exDone"]').length,
      rest: document.querySelectorAll('[data-act="restGo"]').length,
      laid
    };
  });
  check(noneUi.checks === 0 && noneUi.rest === 2, 'no-checks hides every check and offers a manual rest');
  check(noneUi.laid.length === 2 && noneUi.laid.every(r => r.sameRow && r.end && r.flush), 'Start rest shares the + Set row and sits at the end');
  const skip = await page.$('[data-act="tskip"]');
  if (skip) await skip.click();
  await sleep(100);
  check(!(await page.$('#timer')), 'no-checks does not keep an automatic rest running after skip');
  await shot(page, 'mode-none.png');
  await page.click('[data-act="restGo"][data-j="0"]');
  await sleep(150);
  check(!!(await page.$('#timer')), 'manual rest starts the timer');
  await page.click('[data-act="finish"]');
  await page.waitForFunction(() => document.querySelector('#title') && document.querySelector('#title').textContent === 'History');
  const hist = await page.evaluate(() => {
    const w = Store.db.history[0];
    return { n: w.exercises.reduce((s, e) => s + e.sets.length, 0), bench: w.exercises[0].sets.map(s => s.w), row: w.exercises[1].sets.map(s => s.w) };
  });
  check(hist.n === 5 && hist.row.every(w => w === 105), 'history keeps every set, including the edited exercise: ' + JSON.stringify(hist));

  const rtl = await openApp(browser, 8772, 'ar');
  await rtl.waitForFunction(() => document.documentElement.dir === 'rtl');
  await rtl.waitForSelector('#modePicker');
  await shot(rtl, 'rtl-start.png');
  const rtlOrder = await rtl.evaluate(() => {
    const card = document.querySelector('.daycard');
    if (!card) return null;
    return document.documentElement.dir;
  });
  check(rtlOrder === 'rtl', 'arabic start screen is RTL');

  await browser.close();
  beforeSrv.close();
  afterSrv.close();
  if (failed) process.exit(1);
  console.log('check-mode: all checks passed');
}

main().catch(e => { console.error(e); process.exit(1); });
