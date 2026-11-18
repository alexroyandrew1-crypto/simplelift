// Watch settings screen: hidden until a watch is paired, shows the watch's values,
// and a toggle PUTs them for the next watch sync. Also writes screenshots.
import {createRequire} from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {fileURLToPath} from 'url';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS = path.join(ROOT, 'docs/screenshots/watch-settings');
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';

const KEYS = ['title.watchSettings','ws.open','ws.hint','ws.chime','ws.chimeHint','ws.vibration','ws.auto','ws.autoHint','ws.hr','ws.reps','ws.repsHint','ws.save','ws.alert','ws.alert0','ws.alert1','ws.alert2','ws.saved','ws.newer','ws.fail','ws.loadFail','ws.loading','ws.waiting','ws.updated','ws.retry'];
const LANGS = ['i18n.js','lang-es.js','lang-fr.js','lang-de.js','lang-pt.js','lang-it.js','lang-nl.js','lang-ru.js','lang-tr.js','lang-pl.js','lang-zh.js','lang-ja.js','lang-ko.js','lang-ar.js','lang-hi.js','lang-id.js'];

const SETTINGS = {
  chime: false, vibration: true, autoDetectSets: false, showHr: true,
  repDetect: true, saveActivity: false, restAlert: 1, rev: 1731801600000
};
const PAIRED = [{id:'w1', name:'Forerunner 955', model:'fr955', lastSeen: 1731801600000}];

let failed = 0;
function check(cond, msg) {
  if (!cond) { failed++; console.error('FAIL:', msg); }
  else console.log('ok:', msg);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function keysPresent() {
  for (const file of LANGS) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const key of KEYS) {
      if (!text.includes('"' + key + '":')) { failed++; console.error('FAIL:', file, 'missing', key); return; }
    }
  }
  console.log('ok: watch settings strings in every language');
}

function serve(port) {
  const server = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/') u = '/index.html';
    const file = path.join(ROOT, u);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('no'); return;
    }
    const ext = path.extname(file);
    const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.ico':'image/x-icon'};
    res.writeHead(200, {'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}

async function openApp(browser, port, boot) {
  const page = await browser.newPage();
  await page.setViewport(boot.viewport);
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.evaluateOnNewDocument(start => {
    localStorage.setItem('simplelift_terms', JSON.stringify({v:'2026-11-11', at:new Date().toISOString()}));
    localStorage.setItem('simplelift_lang', start.lang);
    localStorage.setItem('simplelift_lang_toast', start.lang);
    localStorage.setItem('simplelift_auth', JSON.stringify({token:'tok', email:'alex@example.com', verified:true, plan:'free'}));
    localStorage.setItem('simplelift_owner', 'alex@example.com');
    localStorage.setItem('simplelift_v1', JSON.stringify({version:1, settings:{units:'lb', unitsChosen:true}, plans:[], activePlanId:null, history:[], active:null, updatedAt:1}));
    window.__ws = start.settings;
    window.__watches = start.watches;
    window.__puts = [];
    const orig = window.fetch.bind(window);
    const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json'}});
    window.fetch = async (url, opts = {}) => {
      const u = String(url);
      const method = String(opts.method || 'GET').toUpperCase();
      if (!u.includes('workers.dev')) return orig(url, opts);
      if (u.includes('/watch/settings') && method === 'PUT') {
        const body = JSON.parse(opts.body || '{}');
        const patch = body.watchSettings || body;
        window.__puts.push(patch);
        window.__ws = Object.assign({}, window.__ws, patch, {rev: 1731801600000 + window.__puts.length});
        return json({watchSettings: window.__ws});
      }
      if (u.includes('/watch/settings')) return json({watchSettings: window.__ws});
      if (u.includes('/watches')) return json({watches: window.__watches});
      if (u.includes('/live')) return json({snap:null, checkMode:'set'});
      if (u.includes('/data')) return json({});
      if (u.includes('/geo')) return json({country:'US'});
      return json({});
    };
  }, boot);
  await page.goto('http://127.0.0.1:' + port + '/', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#tabs button[data-tab="settings"]'));
  await sleep(300);
  return page;
}

async function shot(page, name, fullPage = true) {
  await page.screenshot({path: path.join(SHOTS, name), fullPage});
  console.log('shot', name);
}

async function openSettings(page) {
  await page.click('#tabs button[data-tab="settings"]');
  await page.waitForSelector('#watchCard');
  await page.evaluate(() => document.getElementById('watchCard').scrollIntoView({block:'center'}));
  await sleep(200);
}

async function main() {
  keysPresent();
  fs.mkdirSync(SHOTS, {recursive:true});
  const server = await serve(8774);
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ws-')),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const phone = {width:390, height:844, deviceScaleFactor:2};
  const desk = {width:1280, height:1200, deviceScaleFactor:1};

  const empty = await openApp(browser, 8774, {lang:'en', watches:[], settings:SETTINGS, viewport:phone});
  await openSettings(empty);
  check(!(await empty.$('#watchSettingsBtn')), 'no Watch settings button when nothing is paired');
  check(!!(await empty.$('#watchNone')), 'empty paired list is shown');
  await shot(empty, 'settings-unpaired-phone.png');
  await empty.close();

  const page = await openApp(browser, 8774, {lang:'en', watches:PAIRED, settings:SETTINGS, viewport:phone});
  await openSettings(page);
  await page.waitForSelector('#watchSettingsBtn');
  check((await page.$eval('#watchSettingsBtn', b => b.textContent.trim())) === 'Watch settings', 'paired section has Watch settings');
  await shot(page, 'settings-paired-phone.png');
  await page.click('#watchSettingsBtn');
  await page.waitForSelector('#ws-chime button');
  const pressed = async key => page.$eval('#ws-' + key + ' button', b => b.getAttribute('aria-pressed'));
  check(await pressed('chime') === 'false', 'chime shows the watch value off');
  check(await pressed('vibration') === 'true', 'vibration shows on');
  check(await pressed('autoDetectSets') === 'false', 'auto-detect sets defaults off and shows off');
  check(await pressed('showHr') === 'true', 'heart rate shows on');
  check(await pressed('repDetect') === 'true', 'rep counter shows on');
  check(await pressed('saveActivity') === 'false', 'save to Garmin Connect shows off');
  check(await page.$eval('#wsAlert button[data-v="1"]', b => b.getAttribute('aria-pressed')) === 'true', 'rest-end alert shows Tone');
  const text = await page.$eval('#view', el => el.innerText);
  check(!/lap/i.test(text), 'no laps option on the screen');
  check(text.includes('Updated'), 'stored rev is shown');
  await shot(page, 'screen-values-phone.png');

  await page.click('#ws-autoDetectSets button');
  await page.waitForFunction(() => window.__puts.length === 1);
  const put = await page.evaluate(() => window.__puts[0]);
  check(put.autoDetectSets === true && put.chime === false && put.showHr === true && put.restAlert === 1, 'toggle PUTs the full settings: ' + JSON.stringify(put));
  check(await pressed('autoDetectSets') === 'true', 'auto-detect sets turns on after save');
  check(!(await page.$('#ws-laps')), 'laps row is not in the form');

  await page.setViewport(desk);
  await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; document.getElementById('wsCard').scrollIntoView({block:'start'}); });
  await sleep(200);
  await shot(page, 'screen-values-desktop.png', false);
  await page.close();

  const ar = await openApp(browser, 8774, {lang:'ar', watches:PAIRED, settings:SETTINGS, viewport:phone});
  await openSettings(ar);
  await ar.waitForSelector('#watchSettingsBtn');
  await ar.click('#watchSettingsBtn');
  await ar.waitForSelector('#ws-chime button');
  await ar.waitForFunction(() => document.documentElement.dir === 'rtl');
  check(await ar.$eval('#ws-chime', el => el.innerText.includes('نغمة')), 'Arabic chime label');
  await shot(ar, 'screen-values-ar.png');
  await ar.close();

  await browser.close();
  server.close();
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('watch settings UI ok');
}

main().catch(e => { console.error(e); process.exit(1); });
