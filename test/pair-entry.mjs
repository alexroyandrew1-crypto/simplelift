// Samsung and Apple open on the 6-digit code box. Garmin keeps the Bluetooth lead
// and the "Having trouble? Enter code" fallback. Also writes the Samsung screenshot.
import {createRequire} from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {fileURLToPath} from 'url';
import {artifactDir, chromePath, legalVersion} from './browser-env.mjs';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS = artifactDir('pair');
const CHROME = chromePath();

let failed = 0;
function check(cond, msg) {
  if (!cond) { failed++; console.error('FAIL:', msg); }
  else console.log('ok:', msg);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

async function openApp(browser, port) {
  const page = await browser.newPage();
  await page.setViewport({width:390, height:844, deviceScaleFactor:2});
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.evaluateOnNewDocument(termsV => {
    localStorage.setItem('simplelift_terms', JSON.stringify({v: termsV, at: new Date().toISOString()}));
    localStorage.setItem('simplelift_lang', 'en');
    localStorage.setItem('simplelift_lang_toast', 'en');
    localStorage.setItem('simplelift_auth', JSON.stringify({token:'tok', email:'alex@example.com', verified:true, plan:'free'}));
    localStorage.setItem('simplelift_owner', 'alex@example.com');
    localStorage.setItem('simplelift_v1', JSON.stringify({version:1, settings:{units:'lb', unitsChosen:true}, plans:[], activePlanId:null, history:[], active:null, updatedAt:1}));
    const orig = window.fetch.bind(window);
    const json = body => new Response(JSON.stringify(body), {status:200, headers:{'content-type':'application/json'}});
    window.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (!u.includes('workers.dev')) return orig(url, opts);
      if (u.includes('/watches')) return json({watches:[]});
      if (u.includes('/live')) return json({snap:null, checkMode:'set'});
      if (u.includes('/geo')) return json({country:'US'});
      return json({});
    };
  }, legalVersion(ROOT));
  await page.goto('http://127.0.0.1:' + port + '/', {waitUntil:'domcontentloaded'});
  await page.waitForSelector('#tabs button[data-tab="settings"]');
  await sleep(250);
  return page;
}

async function pick(page, id) {
  await page.click('#back');
  await page.waitForSelector('#pairPick');
  await page.click('[data-act="pairType"][data-v="' + id + '"]');
  await sleep(150);
}

async function main() {
  fs.mkdirSync(SHOTS, {recursive:true});
  const server = await serve(8775);
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'sl-pair-')),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = await openApp(browser, 8775);
  await page.click('#tabs button[data-tab="settings"]');
  await page.waitForSelector('#watchCard [data-act="pair"]');
  await page.click('#watchCard [data-act="pair"]');
  await page.waitForSelector('#pairPick');

  await page.click('[data-act="pairType"][data-v="samsung"]');
  await page.waitForSelector('#pairIn');
  const samsung = await page.evaluate(() => ({
    flow: !!document.getElementById('pairFlow'),
    trouble: !!document.querySelector('[data-act="pairShowCode"]'),
    card: !!document.getElementById('pairCode'),
    focus: document.activeElement && document.activeElement.id,
    title: document.querySelector('#pairCode h3') && document.querySelector('#pairCode h3').textContent
  }));
  check(samsung.card && !samsung.flow && !samsung.trouble, 'Samsung opens on the code card');
  check(samsung.focus === 'pairIn', 'Samsung code box is focused');
  check(samsung.title === 'Samsung Galaxy Watch', 'Samsung title: ' + samsung.title);
  await page.screenshot({path: path.join(SHOTS, 'samsung-code-phone.png'), fullPage: false});
  console.log('shot samsung-code-phone.png');

  await pick(page, 'apple');
  await page.waitForSelector('#pairIn');
  const apple = await page.evaluate(() => ({
    flow: !!document.getElementById('pairFlow'),
    focus: document.activeElement && document.activeElement.id
  }));
  check(!apple.flow && apple.focus === 'pairIn', 'Apple opens on the focused code box');

  await pick(page, 'garmin');
  await page.waitForSelector('#pairFlow');
  const garmin = await page.evaluate(() => ({
    box: !!document.getElementById('pairIn'),
    link: (document.querySelector('[data-act="pairShowCode"]') || {}).textContent || ''
  }));
  check(!garmin.box && /enter code/i.test(garmin.link), 'Garmin stays on the lead with the fallback link: ' + garmin.link.trim());
  await page.click('[data-act="pairShowCode"]');
  await page.waitForSelector('#pairIn');
  check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'pairIn', 'Garmin fallback focuses the code box');

  await browser.close();
  server.close();
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('pair entry ok');
}

main().catch(e => { console.error(e); process.exit(1); });
