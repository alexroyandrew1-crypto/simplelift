// Snapshot rules for live phone/watch sync. No browser and no server.
import fs from 'fs';
import vm from 'vm';
import {fileURLToPath} from 'url';
import path from 'path';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'live.js');
const sandbox = {};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
const {LiveSnap, Live} = sandbox;
if (!LiveSnap) { console.error('FAIL: LiveSnap missing'); process.exit(1); }

let failed = 0;
function check(cond, msg) {
  if (!cond) { failed++; console.error('FAIL:', msg); }
  else console.log('ok:', msg);
}

check(LiveSnap.norm('exercise') === 'exercise' && LiveSnap.norm('nope') === 'set', 'mode names');
check(LiveSnap.toLb(10, 'kg') === 22 && LiveSnap.toLb(135, 'lb') === 135, 'pounds on the wire');
check(LiveSnap.fromLb(22, 'kg') === 10, 'kg back from pounds');

const active = {
  id: 's1', rev: 2, revAt: 100, checkMode: 'exercise', dayIndex: 1, dayName: 'Push', planId: 'p',
  focus: 0, started: 90_000, restEnd: 200_000,
  exercises: [{ name: 'Bench', rest: 90, sets: [{ w: 100, r: 8, done: true }, { w: 100, r: 8, done: false }] }]
};
const snap = LiveSnap.fromActive(active, 'kg');
check(snap.src === 'p' && snap.mode === 'exercise' && snap.rest === 200, 'snapshot carries mode and rest');
check(snap.ex[0].s[0].w === 220 && snap.ex[0].s[0].u === 'kg' && snap.ex[0].s[0].v === 100 && snap.ex[0].s[0].d === 1 && snap.ex[0].s[1].d === 0, 'legacy pounds plus exact kg');
check(LiveSnap.wins(active, { ...snap, rev: 2 }, 'p') === false, 'own echo is ignored');
check(LiveSnap.wins(active, { ...snap, src: 'w', rev: 3 }, 'p') === true, 'higher rev from the watch wins');
check(LiveSnap.wins(active, { ...snap, src: 'w', id: 'other', rev: 1, at: 50 }, 'p') === false, 'older other workout does not replace');
check(LiveSnap.wins(active, { ...snap, src: 'w', id: 'other', rev: 1, at: 200 }, 'p') === true, 'newer other workout replaces');
check(LiveSnap.wins(null, { t: 'snap', id: 'n', rev: 1, drop: 1 }, 'p') === false, 'drop does not open a session');

const hist = LiveSnap.historyFrom({ ...snap, fin: 1, src: 'w' }, 'lb');
check(hist.id === 's1' && hist.exercises[0].sets.length === 2 && hist.fromWatch === true, 'finish logs every set in the snapshot');
const partial = LiveSnap.historyFrom({ ...snap, fin: 0 }, 'lb');
check(partial.exercises[0].sets.length === 1, 'an open snapshot only counts checked sets');

const phoneSettings = {
  t: 'settings', rev: 1731801600000, src: 'w',
  chime: false, vibration: true, autoDetectSets: true, showHr: false,
  repDetect: true, saveActivity: true, restAlert: 2
};
Live.keepSettings(phoneSettings);
check(Live.settings && Live.settings.rev === 1731801600000, 'settings rev keeps the server millisecond stamp: ' + (Live.settings && Live.settings.rev));
check(Live.settings.chime === false && Live.settings.autoDetectSets === true && Live.settings.showHr === false && Live.settings.restAlert === 2, 'data-layer settings use the watchSettings fields');
Live.keepSettings({ t: 'settings', rev: 1731801500000, chime: true, autoDetectSets: false, showHr: true, restAlert: 0 });
check(Live.settings.rev === 1731801600000 && Live.settings.chime === false && Live.settings.autoDetectSets === true, 'an older settings rev does not replace');

const precise = {
  id: 'kg1', rev: 1, revAt: 1, checkMode: 'set', dayIndex: 0, dayName: 'Legs', planId: 'p',
  focus: 0, started: 1000,
  exercises: [{ name: 'Squat', rest: 120, sets: [{ w: 61.25, r: 5, done: true }, { w: 1.25, r: 12, done: false }] }]
};
const wire = LiveSnap.fromActive(precise, 'kg');
check(wire.ex[0].s[0].u === 'kg' && wire.ex[0].s[0].v === 61.25 && wire.ex[0].s[1].v === 1.25, '61.25 kg and 1.25 kg are sent exactly');
check(LiveSnap.decode(wire.ex[0].s[0], 'kg') === 61.25 && LiveSnap.decode(wire.ex[0].s[1], 'kg') === 1.25, '61.25 kg round-trips exactly');
const logged = LiveSnap.historyFrom(Object.assign({}, wire, { fin: 1 }), 'kg');
check(logged.exercises[0].sets[0].w === 61.25 && logged.exercises[0].sets[1].w === 1.25, 'a finished log keeps the hundredths');
const echoed = LiveSnap.fromActive({
  id: 'kg1', rev: 2, checkMode: 'set', dayIndex: 0, dayName: 'Legs', planId: 'p', focus: 0, started: 1000,
  exercises: [{ name: 'Squat', rest: 120, sets: [{ w: logged.exercises[0].sets[0].w, r: 5, done: true }] }]
}, 'kg');
check(echoed.ex[0].s[0].v === 61.25, 'a second send of the round-tripped weight is still 61.25');
const legacy = { t: 'snap', id: 'old', fin: 1, src: 'w', ex: [{ n: 'Squat', s: [{ w: 135, r: 5, d: 1 }] }] };
check(LiveSnap.historyFrom(legacy, 'kg').exercises[0].sets[0].w === 60, 'an old whole-pound snapshot still plate-rounds');
check(LiveSnap.decode({ w: 135, u: 'kg', v: 61.25 }, 'kg') === 61.25, 'exact fields win over the legacy pounds');

if (failed) process.exit(1);
console.log('live-snap: all checks passed');
