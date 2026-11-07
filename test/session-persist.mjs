// Regression tests for the in-progress workout (v30).
// A tab switch clears the in-app stack but used to leave the browser Back sentinel.
// Back then opened Today, which redraws the plan with no completed sets, while the
// rest interval kept running and still alarmed.
//
// Run: npm install --no-save puppeteer-core@23.11.1 && node test/session-persist.mjs
import {createRequire} from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {fileURLToPath} from 'url';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = '/opt/cursor/artifacts';
const PORT = 8766;
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const file = path.join(ROOT, u);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('no'); return;
  }
  const ext = path.extname(file);
  const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
  res.writeHead(200, {'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
function check(cond, msg) {
  if (!cond) { failed++; console.error('FAIL:', msg); }
  else console.log('ok:', msg);
}

const PLAN = {
  id:'p1', name:'Test Plan', created:1, next:0,
  days:[{id:'d1', name:'Push', rest:false, color:'#4ade80', exercises:[
    {id:'e1', name:'Bench Press', sets:3, repMin:8, repMax:10, weight:135, rest:90, note:''},
    {id:'e2', name:'Row', sets:3, repMin:10, repMax:12, weight:95, rest:60, note:''}
  ]}]
};

function bootScript() {
  return `(() => {
    const json = (o, status=200) => new Response(JSON.stringify(o), {status, headers:{'Content-Type':'application/json'}});
    window.__putDelay = 0;
    window.__putRespond = null;
    window.__loginEmail = 'a@example.com';
    window.__hits = [];
    window.fetch = async (url, opts) => {
      const u = String(url), method = (opts && opts.method) || 'GET';
      window.__hits.push(method + ' ' + u);
      if (u.includes('/geo')) return json({country:'US'});
      if (u.includes('/logout')) return json({});
      if (u.includes('/login') || u.includes('/register')) return json({token:'tok-'+window.__loginEmail, email:window.__loginEmail, verified:true});
      if (u.includes('/data')) {
        if (method === 'PUT') {
          const sent = JSON.parse(opts.body);
          await new Promise(r => setTimeout(r, window.__putDelay || 0));
          if (window.__putRespond) return json(window.__putRespond(sent));
          return json({data: sent.data, watchResults:[]});
        }
        return json({data: window.__serverData || {version:1, settings:{units:'lb', unitsChosen:true}, plans:[], activePlanId:null, history:[], active:null}});
      }
      return json({});
    };
  })();`;
}

async function openApp(browser) {
  const page = await browser.newPage();
  await page.setViewport({width:390, height:844, deviceScaleFactor:1});
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.evaluateOnNewDocument(bootScript());
  await page.goto('http://127.0.0.1:'+PORT+'/', {waitUntil:'domcontentloaded'});
  await page.evaluate(plan => {
    localStorage.setItem('simplelift_terms', JSON.stringify({v:'2026-11-03', at:new Date().toISOString()}));
    localStorage.setItem('simplelift_lang', 'en');
    localStorage.setItem('simplelift_lang_toast', 'en');
    const db = {version:1, settings:{units:'lb', unitsChosen:true}, plans:[plan], activePlanId:plan.id, history:[], active:null, updatedAt:1};
    // Replace the live store too. Otherwise pagehide writes the previous profile's workout back.
    if (window.Store) { Store.reset(); Object.assign(Store.db, db); Store.db.active = null; Store.save(); }
    else localStorage.setItem('simplelift_v1', JSON.stringify(db));
  }, PLAN);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#title') && document.querySelector('#title').textContent === 'Today');
  return page;
}

async function startAndLog(page) {
  await page.click('[data-act="start"]');
  await page.waitForFunction(() => document.querySelector('#title').textContent === 'Workout');
  await page.evaluate(() => {
    const w = document.querySelector('[data-bind="set.0.0.w"]');
    w.value = '185';
    w.dispatchEvent(new Event('input', {bubbles:true}));
    const r = document.querySelector('[data-bind="set.0.0.r"]');
    r.value = '12';
    r.dispatchEvent(new Event('input', {bubbles:true}));
  });
  await page.click('[data-act="setDone"][data-j="0"][data-k="0"]');
  await page.click('[data-act="stp"][data-j="1"][data-k="0"][data-f="w"][data-d="1"]');
  await sleep(100);
}

async function main() {
  fs.mkdirSync(ART, {recursive:true});
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const launch = dir => puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: dir,
    args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
  });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-profile-'));
  let browser = await launch(profile);
  const page = await openApp(browser);
  const read = () => page.evaluate(() => {
    const a = Store.db.active;
    const plan = Store.db.plans[0].days[0].exercises;
    const card1 = document.querySelector('.ex-card[data-ex="1"]');
    const hdr = document.querySelector('header').getBoundingClientRect().bottom;
    return {
      route: route.v,
      title: document.querySelector('#title').textContent,
      progress: (document.body.innerText.match(/\d+\/\d+ sets/) || [null])[0],
      sets: a && a.exercises.map(e => e.sets.map(s => ({w:s.w, r:s.r, done:!!s.done}))),
      focus: a && a.focus,
      restEnd: a && a.restEnd,
      sid: a && a.id,
      timer: (() => { const el = document.querySelector('#timer'); if (!el) return false; const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden'; })(),
      timerText: document.querySelector('#tl') && document.querySelector('#tl').textContent,
      plan: plan.map(e => ({repMin:e.repMin, repMax:e.repMax, weight:e.weight})),
      buzz: window.__buzz || 0,
      card1Top: card1 ? card1.getBoundingClientRect().top : null,
      hdr,
      active: !!a
    };
  });

  await startAndLog(page);
  let s = await read();
  check(s.route === 'session', 'workout screen is open');
  check(s.sets[0][0].done === true && s.sets[0][0].r === 12 && s.sets[0][0].w === 185, 'first set logged with session reps and weight');
  check(s.sets[1][0].w === 100, 'stepper on the second exercise changed that session weight (95+5)');
  check(s.focus === 1, 'active exercise follows the last set edited');
  check(s.plan[0].repMin === 8 && s.plan[0].weight === 135 && s.plan[1].repMin === 10 && s.plan[1].weight === 95, 'session edits do not change saved plan defaults');
  check(s.timer && /^1:/.test(s.timerText || ''), 'rest timer is running ('+(s.timerText)+')');
  const sid = s.sid, restEnd = s.restEnd;
  await page.screenshot({path: path.join(ART, 'workout-partial.png')});

  await page.click('#tabs button[data-tab="history"]');
  await page.waitForFunction(() => document.querySelector('#title').textContent === 'History');
  s = await read();
  check(s.route === 'history' && s.timer, 'timer stays visible on another page while rest is running');
  check(s.sets[0][0].done && s.sets[0][0].r === 12 && s.restEnd === restEnd, 'leaving the workout does not clear sets or the timer end');
  await page.screenshot({path: path.join(ART, 'rest-timer-on-history.png')});

  await page.evaluate(() => history.back());
  await page.waitForFunction(() => document.querySelector('#title').textContent === 'Workout');
  s = await read();
  check(s.route === 'session', 'system Back from another page returns to the workout, not a fresh Today');
  check(s.sets[0][0].done === true && s.sets[0][0].r === 12 && s.sets[0][0].w === 185, 'completed set, reps and weight survive Back');
  check(s.sets[1][0].w === 100 && s.focus === 1, 'second exercise weight and active exercise survive Back');
  check(s.sid === sid && s.restEnd === restEnd && s.timer, 'the same rest timer is still the one on screen');
  check(s.card1Top != null && s.card1Top > s.hdr - 8 && s.card1Top < 844, 'active exercise is brought back on screen ('+Math.round(s.card1Top)+')');
  check(s.plan[0].repMin === 8 && s.plan[1].weight === 95, 'plan defaults still unchanged after return');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({path: path.join(ART, 'workout-preserved-after-back.png')});

  // Repeated navigation: tabs and Back, state identical.
  for (const tab of ['plans','settings','history']) {
    await page.click('#tabs button[data-tab="'+tab+'"]');
    await sleep(40);
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => document.querySelector('#title').textContent === 'Workout');
  }
  s = await read();
  check(s.sid === sid && s.sets[0][0].done && s.sets[0][0].r === 12 && s.sets[1][0].w === 100 && s.restEnd === restEnd, 'repeated tab and Back trips keep the same session');

  // Back from the workout itself (empty stack) opens Today, still showing this session.
  await page.evaluate(() => pop());
  await page.waitForFunction(() => document.querySelector('#title').textContent === 'Today');
  s = await read();
  check(s.timer, 'timer keeps counting on Today');
  const todayText = await page.$eval('#view', el => el.innerText);
  check(todayText.includes('1/6 sets') && todayText.includes('Resume workout'), 'Today shows in-progress progress and Resume, not a reset workout');
  await page.click('[data-act="start"]');
  await page.waitForFunction(() => document.querySelector('#title').textContent === 'Workout');
  s = await read();
  check(s.sid === sid && s.sets[0][0].done && s.sets[0][0].r === 12, 'Resume does not replace the session');

  // Refresh and a new page (reopen) with the same profile.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#title') && document.querySelector('#title').textContent === 'Workout');
  s = await read();
  check(s.sets[0][0].done && s.sets[0][0].r === 12 && s.sets[0][0].w === 185 && s.focus === 1 && s.timer, 'refresh restores sets, reps, weight, exercise and timer');
  await page.close();
  await browser.close();
  browser = await launch(profile);
  const reopened = await browser.newPage();
  await reopened.setViewport({width:390, height:844});
  await reopened.evaluateOnNewDocument(bootScript());
  await reopened.goto('http://127.0.0.1:'+PORT+'/', {waitUntil:'domcontentloaded'});
  await reopened.waitForFunction(() => document.querySelector('#title') && document.querySelector('#title').textContent === 'Workout', {timeout:8000});
  const re = await reopened.evaluate(() => {
    const a = Store.db.active;
    return {done:a.exercises[0].sets[0].done, r:a.exercises[0].sets[0].r, w:a.exercises[0].sets[0].w, focus:a.focus, timer:!!document.querySelector('#timer'), id:a.id};
  });
  check(re.done && re.r === 12 && re.w === 185 && re.focus === 1 && re.timer && re.id === sid, 'reopening the browser restores the same workout and timer');
  await reopened.close();
  await browser.close();

  // Alarm while away, then Back: sets remain, alarm fires once, timer stops.
  browser = await launch(fs.mkdtempSync(path.join(os.tmpdir(), 'sl-alarm-')));
  const alarm = await openApp(browser);
  await alarm.evaluate(() => { Store.db.plans[0].days[0].exercises[0].rest = 1; Store.save(); });
  await alarm.click('[data-act="start"]');
  await alarm.waitForFunction(() => document.querySelector('#title').textContent === 'Workout');
  await alarm.evaluate(() => {
    const r = document.querySelector('[data-bind="set.0.0.r"]');
    r.value = '9';
    r.dispatchEvent(new Event('input', {bubbles:true}));
  });
  await alarm.click('[data-act="setDone"][data-j="0"][data-k="0"]');
  await alarm.click('#tabs button[data-tab="plans"]');
  await alarm.waitForFunction(() => (window.__buzz || 0) >= 1, {timeout:4000});
  await sleep(600);
  const buzz = await alarm.evaluate(() => window.__buzz || 0);
  check(buzz === 1, 'rest alarm fires once while another page is open ('+buzz+')');
  let al = await alarm.evaluate(() => {
    const a = Store.db.active;
    return {done:a.exercises[0].sets[0].done, r:a.exercises[0].sets[0].r, timer:!!document.querySelector('#timer'), plan:Store.db.plans[0].days[0].exercises[0].repMin};
  });
  check(al.done && al.r === 9 && !al.timer && al.plan === 8, 'after the alarm the set is still logged and the timer has stopped');
  await alarm.evaluate(() => history.back());
  await alarm.waitForFunction(() => document.querySelector('#title').textContent === 'Workout');
  al = await alarm.evaluate(() => {
    const a = Store.db.active;
    return {done:a.exercises[0].sets[0].done, r:a.exercises[0].sets[0].r, timer:!!document.querySelector('#timer'), buzz:window.__buzz||0};
  });
  check(al.done && al.r === 9 && !al.timer && al.buzz === 1, 'returning after the alarm shows the same set and does not alarm again');

  // Finish, then a stale server copy must not resurrect the workout.
  await alarm.evaluate(() => {
    localStorage.setItem('simplelift_owner', 'a@example.com');
    Sync.set({token:'tok-a@example.com', email:'a@example.com', verified:true});
    window.__putRespond = sent => ({data: Object.assign({}, sent.data, {active: {id:'stale', started:1, planId:'p1', dayIndex:0, dayName:'Push', exercises:[{name:'Bench Press', sets:[{w:1,r:1,done:false}]}]}}), watchResults:[]});
  });
  await alarm.click('[data-act="finish"]');
  await alarm.waitForSelector('.sheet');
  await alarm.evaluate(() => {
    const b = [...document.querySelectorAll('.sheet button')].find(x => /ticked set/.test(x.textContent));
    b.click();
  });
  await alarm.waitForFunction(() => document.querySelector('#title').textContent === 'History');
  await alarm.evaluate(async () => {
    localStorage.setItem('simplelift_owner', 'a@example.com');
    Sync.set({token:'tok-a@example.com', email:'a@example.com', verified:true});
    await Sync.now();
  });
  const afterFinish = await alarm.evaluate(() => ({active: Store.db.active, timer: !!document.querySelector('#timer'), hist: Store.db.history.length}));
  check(afterFinish.active == null && !afterFinish.timer && afterFinish.hist === 1, 'finish saves history, clears the session, and a stale pull does not bring it back');

  // Discard, then the same.
  await alarm.click('#tabs button[data-tab="home"]');
  await alarm.waitForFunction(() => document.querySelector('[data-act="start"]'));
  await alarm.click('[data-act="start"]');
  await alarm.waitForFunction(() => document.querySelector('#title').textContent === 'Workout');
  await alarm.click('[data-act="setDone"][data-j="0"][data-k="0"]');
  await alarm.click('[data-act="sessMenu"]');
  await alarm.waitForSelector('.sheet');
  await alarm.evaluate(() => [...document.querySelectorAll('.sheet button')].find(x => x.textContent.includes('Discard workout')).click());
  await alarm.waitForFunction(() => document.body.innerText.includes('Discard this workout?'));
  await alarm.evaluate(() => [...document.querySelectorAll('.sheet button')].find(x => x.textContent === 'Discard workout').click());
  await alarm.waitForFunction(() => !Store.db.active && document.querySelector('#title').textContent === 'Today');
  await alarm.evaluate(() => Sync.now());
  const afterDiscard = await alarm.evaluate(() => ({active: Store.db.active, timer: !!document.querySelector('#timer')}));
  check(afterDiscard.active == null && !afterDiscard.timer, 'discard clears the workout and a stale pull does not resurrect it');

  // Sign-out must not resurrect, and must not leak into the next account.
  const leak = await alarm.evaluate(async () => {
    localStorage.setItem('simplelift_owner', 'a@example.com');
    Sync.set({token:'tok-a@example.com', email:'a@example.com', verified:true});
    Store.db.plans[0].name = 'A-SECRET';
    Store.db.active = {id:'a-live', started:Date.now(), planId:'p1', dayIndex:0, dayName:'Push', focus:0, exercises:[{name:'Secret Lift', sets:[{w:99,r:3,done:true}]}]};
    Store.save();
    window.__putDelay = 250;
    window.__putRespond = () => ({data:{version:1, settings:{units:'lb', unitsChosen:true}, plans:[{id:'poison', name:'A-SECRET', days:[]}], activePlanId:'poison', history:[], active:{id:'a-live', started:1, dayName:'Push', exercises:[{name:'Secret Lift', sets:[{w:99,r:3,done:true}]}]}}, watchResults:[]});
    const inflight = Sync.now();
    await Sync.signOut();
    await inflight.catch(()=>{});
    const afterOut = {active: Store.db.active, plans: Store.db.plans.map(p=>p.name), timer: !!document.querySelector('#timer'), auth: !!localStorage.getItem('simplelift_auth')};
    window.__putDelay = 0;
    window.__loginEmail = 'b@example.com';
    window.__serverData = {version:1, settings:{units:'lb', unitsChosen:true}, plans:[{id:'bp', name:'B-ONLY', created:1, next:0, days:[{id:'bd', name:'Pull', rest:false, exercises:[{id:'be', name:'Pull-up', sets:3, repMin:5, repMax:8, weight:'', rest:60}]}]}], activePlanId:'bp', history:[], active:{id:'b-live', started:Date.now()+1000, planId:'bp', dayIndex:0, dayName:'Pull', exercises:[{name:'Pull-up', sets:[{w:0,r:5,done:false}]}]}, updatedAt:Date.now()};
    window.__putRespond = sent => ({data: window.__serverData, watchResults:[]});
    // GET during adopt uses __serverData. PUT echo must not be A's blob.
    await Sync.signIn('in', 'b@example.com', 'password123');
    const names = Store.db.plans.map(p => p.name);
    return {afterOut, names, activeName: Store.db.active && Store.db.active.dayName, blob: JSON.stringify(Store.db)};
  });
  check(leak.afterOut.active == null && leak.afterOut.auth === false && !leak.afterOut.timer, 'sign-out clears the session, the timer and the auth token');
  check(!leak.afterOut.plans.includes('A-SECRET'), 'sign-out wipes the previous account data locally');
  check(leak.names.includes('B-ONLY') && !leak.blob.includes('A-SECRET') && !leak.blob.includes('Secret Lift'), 'signing in as someone else does not keep the previous account workout ('+leak.names.join(',')+')');

  // Same account signing back in must not revive the workout that was signed out.
  const revived = await alarm.evaluate(async () => {
    await Sync.signOut();
    window.__loginEmail = 'a@example.com';
    window.__serverData = {version:1, settings:{units:'lb', unitsChosen:true}, plans:[{id:'p1', name:'Test Plan', created:1, next:0, days:[{id:'d1', name:'Push', rest:false, exercises:[{id:'e1', name:'Bench Press', sets:3, repMin:8, repMax:10, weight:135, rest:90}]}]}], activePlanId:'p1', history:[], active:{id:'old', started:1, planId:'p1', dayIndex:0, dayName:'Push', exercises:[{name:'Bench Press', sets:[{w:185,r:12,done:true}]}]}, updatedAt:Date.now()};
    window.__putRespond = () => ({data: window.__serverData, watchResults:[]});
    await Sync.signIn('in', 'a@example.com', 'password123');
    return {active: Store.db.active, name: Store.db.plans[0] && Store.db.plans[0].name};
  });
  check(revived.active == null && revived.name === 'Test Plan', 'signing back in does not resurrect the workout that was signed out');

  await browser.close();
  server.close();
  if (failed) {
    console.error(failed + ' check(s) failed');
    process.exit(1);
  }
  console.log('all session persistence checks passed');
}

main().catch(e => { console.error(e); process.exit(1); });
