// Live workout snapshot. One row per account, separate from the account blob.
// rev on the stored row and inside the snapshot is assigned here. A client rev is ignored,
// so a caller cannot pin the row by sending a huge number. The value is unix seconds
// (strictly increasing), which fits the 32-bit numbers the Garmin watch compares.
// Not applied to production until migrations/0006_live_session.sql has been run.

import { HttpError } from './errors.js';

export const LIVE_SQL = `
CREATE TABLE IF NOT EXISTS live_session (
  user_id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  snap TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export const LIVE_MAX_BODY = 64 * 1024;
const MAX_EX = 40;
const MAX_SETS = 12;
const MAX_REV = 2147483647;
const MODES = ['set', 'exercise', 'none'];

function fail(msg) {
  throw new HttpError(400, msg, 'bad_snap');
}

function str(value, max, field) {
  if (typeof value !== 'string') fail('Bad ' + field);
  const s = value.trim();
  if (s.length > max) fail(field + ' is too long');
  return s;
}

function optStr(value, max, field) {
  if (value == null || value === '') return '';
  return str(value, max, field);
}

function intIn(value, min, max, field) {
  const n = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
  if (!Number.isFinite(n) || Math.trunc(n) !== n || n < min || n > max) fail('Bad ' + field);
  return n;
}

function optInt(value, min, max, field, fallback) {
  if (value == null || value === '') return fallback;
  return intIn(value, min, max, field);
}

/** A snapshot the phone and the watches already send. Unknown fields are dropped. */
export function validateSnap(snap) {
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) fail('Missing snap');
  if (snap.t !== 'snap') fail('Missing snap');
  const id = str(snap.id, 64, 'id');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) fail('Bad id');
  let src = '';
  if (snap.src != null && snap.src !== '') {
    src = str(snap.src, 2, 'src');
    if (src !== 'p' && src !== 'w') fail('Bad src');
  }
  let mode = '';
  if (snap.mode != null && snap.mode !== '') {
    mode = str(snap.mode, 16, 'mode');
    if (!MODES.includes(mode)) fail('Bad mode');
  }
  const exIn = snap.ex == null ? [] : snap.ex;
  if (!Array.isArray(exIn) || exIn.length > MAX_EX) fail('Bad exercises');
  const ex = exIn.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('Bad exercise');
    const setsIn = row.s == null ? [] : row.s;
    if (!Array.isArray(setsIn) || setsIn.length > MAX_SETS) fail('Bad sets');
    const s = setsIn.map(set => {
      if (!set || typeof set !== 'object' || Array.isArray(set)) fail('Bad set');
      return {
        w: Number.isFinite(+set.w) ? Math.max(0, Math.min(5000, Math.round(+set.w))) : 0,
        r: Number.isFinite(+set.r) ? Math.max(0, Math.min(100, Math.round(+set.r))) : 0,
        d: set.d ? 1 : 0
      };
    });
    return { n: optStr(row.n, 80, 'name'), rest: optInt(row.rest, 0, 3600, 'rest', 0), s };
  });
  const ordIn = snap.ord == null ? [] : snap.ord;
  if (!Array.isArray(ordIn) || ordIn.length > MAX_EX) fail('Bad order');
  const ord = ordIn.map(n => intIn(n, 0, MAX_EX, 'order'));
  const out = {
    t: 'snap',
    id,
    rev: 0,
    src,
    at: optInt(snap.at, 0, MAX_REV, 'at', 0),
    mode,
    day: optInt(snap.day, 0, 60, 'day', 0),
    name: optStr(snap.name, 80, 'name'),
    plan: optStr(snap.plan, 64, 'plan'),
    code: optStr(snap.code, 4000, 'code'),
    idx: optInt(snap.idx, 0, MAX_EX, 'idx', 0),
    ord,
    rest: optInt(snap.rest, 0, MAX_REV, 'rest', 0),
    restTotal: optInt(snap.restTotal, 0, 86400, 'restTotal', 0),
    fin: snap.fin ? 1 : 0,
    drop: snap.drop ? 1 : 0,
    ex
  };
  if (snap.auto != null && snap.auto !== '') out.auto = snap.auto ? 1 : 0;
  return out;
}

/** Unix seconds, strictly above the previous stored rev, capped at a signed 32-bit int. */
export function nextServerRev(prev, nowMs) {
  const sec = Math.floor((Number(nowMs) || Date.now()) / 1000);
  let n = Math.max(sec, (prev | 0) + 1, 1);
  if (n > MAX_REV) n = sec > 0 && sec <= MAX_REV ? sec : MAX_REV;
  return n;
}

export function serverNow(env) {
  if (env && typeof env.now === 'function') {
    const n = Number(env.now());
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return Date.now();
}

export async function saveSnap(db, userId, snap, nowMs) {
  const row = await db.prepare('SELECT rev FROM live_session WHERE user_id=?').bind(userId).first();
  const rev = nextServerRev(row ? row.rev : 0, nowMs);
  const stored = { ...snap, rev };
  const text = JSON.stringify(stored);
  await db.prepare(
    'INSERT INTO live_session (user_id, rev, snap, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET rev=excluded.rev, snap=excluded.snap, updated_at=excluded.updated_at'
  ).bind(userId, rev, text, nowMs).run();
  return stored;
}

export async function readSnap(db, userId) {
  const row = await db.prepare('SELECT snap FROM live_session WHERE user_id=?').bind(userId).first();
  if (!row || !row.snap) return null;
  try { return JSON.parse(row.snap); } catch (e) { return null; }
}

export async function readCheckMode(db, userId) {
  const row = await db.prepare('SELECT blob FROM data WHERE user_id=?').bind(userId).first();
  if (!row || !row.blob) return null;
  try {
    const data = typeof row.blob === 'string' ? JSON.parse(row.blob) : row.blob;
    const m = data && data.settings && data.settings.checkMode;
    return MODES.includes(m) ? m : null;
  } catch (e) { return null; }
}

export async function readAutoDetect(db, userId) {
  const row = await db.prepare('SELECT blob FROM data WHERE user_id=?').bind(userId).first();
  if (!row || !row.blob) return null;
  try {
    const data = typeof row.blob === 'string' ? JSON.parse(row.blob) : row.blob;
    const value = data && data.settings && data.settings.autoDetectSets;
    return typeof value === 'boolean' ? value : null;
  } catch (e) { return null; }
}

export function normMode(m) {
  return MODES.includes(m) ? m : 'set';
}
