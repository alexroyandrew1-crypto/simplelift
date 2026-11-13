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
const {LiveSnap} = sandbox;
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
check(snap.ex[0].s[0].w === 220 && snap.ex[0].s[0].d === 1 && snap.ex[0].s[1].d === 0, 'done flag and kg weight');
check(LiveSnap.wins(active, { ...snap, rev: 2 }, 'p') === false, 'own echo is ignored');
check(LiveSnap.wins(active, { ...snap, src: 'w', rev: 3 }, 'p') === true, 'higher rev from the watch wins');
check(LiveSnap.wins(active, { ...snap, src: 'w', id: 'other', rev: 1, at: 50 }, 'p') === false, 'older other workout does not replace');
check(LiveSnap.wins(active, { ...snap, src: 'w', id: 'other', rev: 1, at: 200 }, 'p') === true, 'newer other workout replaces');
check(LiveSnap.wins(null, { t: 'snap', id: 'n', rev: 1, drop: 1 }, 'p') === false, 'drop does not open a session');

const hist = LiveSnap.historyFrom({ ...snap, fin: 1, src: 'w' }, 'lb');
check(hist.id === 's1' && hist.exercises[0].sets.length === 2 && hist.fromWatch === true, 'finish logs every set in the snapshot');
const partial = LiveSnap.historyFrom({ ...snap, fin: 0 }, 'lb');
check(partial.exercises[0].sets.length === 1, 'an open snapshot only counts checked sets');

if (failed) process.exit(1);
console.log('live-snap: all checks passed');
