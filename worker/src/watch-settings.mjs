// Per-account watch settings for the Simple Lift Cloudflare Worker.
// NOT DEPLOYED by this change. Merge these handlers into the existing Worker
// (https://simplelift-api.alexroyandrew1.workers.dev) and run WATCH_SETTINGS_SQL
// once on its D1 database. Do not replace the whole Worker with this file.
//
// Wire-up, before the existing fetch switch returns:
//   const settings = await watchSettingsRoutes(request, env, { userIdFromBearer, userIdFromWatch });
//   if (settings) return settings;
//
// On the existing GET /watch/workout response (watch bearer, same as today):
//   body = attachWatchSettings(body, await readWatchSettings(env.DB, userId));
// That keeps code, checkMode, and the legacy restAlert field. When a row exists,
// restAlert is the number from watchSettings so older watches keep working.
// These routes must sit behind the same rate limit as /watch/result and /data.
//
// rev is server time in milliseconds. The client cannot choose it. A write whose
// server timestamp is older than the stored rev is ignored (last write wins).

export const WATCH_SETTINGS_SQL = `
CREATE TABLE IF NOT EXISTS watch_settings (
  user_id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  rev INTEGER NOT NULL
);
`;

const BOOL_KEYS = ['chime', 'vibration', 'autoDetectSets', 'showHr', 'repDetect', 'saveActivity'];
const ALERT_WORDS = { vibrate: 0, tone: 1, sound: 1, both: 2, '0': 0, '1': 1, '2': 2 };
const MAX_BODY = 4000;

/** Defaults match the watch: chime, vibration, rep counter, heart rate, and Garmin Connect save on; auto-detect sets off; rest alert vibrate. */
export function defaultWatchSettings(rev = 0) {
  return {
    chime: true,
    vibration: true,
    autoDetectSets: false,
    showHr: true,
    repDetect: true,
    saveActivity: true,
    restAlert: 0,
    rev: Number.isFinite(rev) ? Math.trunc(rev) : 0
  };
}

/** Accept 0|1|2 or the legacy workout strings the watch already understands. */
export function parseRestAlert(value) {
  if (typeof value === 'number' && (value === 0 || value === 1 || value === 2)) return value;
  if (typeof value !== 'string') return null;
  const word = value.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ALERT_WORDS, word) ? ALERT_WORDS[word] : null;
}

function pack(src, rev) {
  const base = defaultWatchSettings(rev);
  const out = defaultWatchSettings(rev);
  const from = src && typeof src === 'object' ? src : {};
  for (const key of BOOL_KEYS) {
    if (typeof from[key] === 'boolean') out[key] = from[key];
  }
  const alert = parseRestAlert(from.restAlert);
  if (alert != null) out.restAlert = alert;
  out.rev = base.rev;
  return out;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function bearer(request) {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : '';
}

function serverNow(env) {
  if (env && typeof env.now === 'function') {
    const n = Number(env.now());
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return Date.now();
}

export async function readWatchSettings(db, userId) {
  const row = await db.prepare('SELECT body, rev FROM watch_settings WHERE user_id = ?').bind(userId).first();
  if (!row || row.body == null) return null;
  let parsed = null;
  try { parsed = JSON.parse(row.body); } catch (e) { return null; }
  return pack(parsed, Number(row.rev) || 0);
}

async function writeWatchSettings(db, userId, settings, rev) {
  const current = await readWatchSettings(db, userId);
  if (current && current.rev > rev) return current;
  const stored = pack(settings, rev);
  const body = JSON.stringify({
    chime: stored.chime,
    vibration: stored.vibration,
    autoDetectSets: stored.autoDetectSets,
    showHr: stored.showHr,
    repDetect: stored.repDetect,
    saveActivity: stored.saveActivity,
    restAlert: stored.restAlert
  });
  await db.prepare(
    'INSERT INTO watch_settings (user_id, body, rev) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET body = excluded.body, rev = excluded.rev WHERE excluded.rev >= watch_settings.rev'
  ).bind(userId, body, rev).run();
  return await readWatchSettings(db, userId) || stored;
}

function payloadOf(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad_settings' };
  const wrapped = body.watchSettings;
  if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) return { src: wrapped };
  return { src: body };
}

function applyPatch(base, src) {
  const next = {
    chime: base.chime,
    vibration: base.vibration,
    autoDetectSets: base.autoDetectSets,
    showHr: base.showHr,
    repDetect: base.repDetect,
    saveActivity: base.saveActivity,
    restAlert: base.restAlert
  };
  let seen = false;
  for (const key of BOOL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    if (typeof src[key] !== 'boolean') return { error: 'bad_settings' };
    next[key] = src[key];
    seen = true;
  }
  if (Object.prototype.hasOwnProperty.call(src, 'restAlert')) {
    const alert = parseRestAlert(src.restAlert);
    if (alert == null) return { error: 'bad_settings' };
    next.restAlert = alert;
    seen = true;
  }
  if (!seen) return { error: 'bad_settings' };
  return { settings: next };
}

/**
 * Phone GET/PUT /watch/settings and watch POST /watch/settings.
 * Returns null when the path is not /watch/settings so the existing router keeps it.
 * @param {Request} request
 * @param {{ DB: object, now?: () => number }} env
 * @param {{ userIdFromBearer: (token: string) => Promise<string|null>, userIdFromWatch: (token: string) => Promise<string|null> }} auth
 */
export async function watchSettingsRoutes(request, env, auth) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (path !== '/watch/settings') return null;
  const method = request.method;
  if (method !== 'GET' && method !== 'PUT' && method !== 'POST') return json({ error: 'method' }, 405);
  const token = bearer(request);
  if (!token || !auth) return json({ error: 'unauthorized' }, 401);
  const phone = method === 'GET' || method === 'PUT';
  const userId = phone ? await auth.userIdFromBearer(token) : await auth.userIdFromWatch(token);
  if (!userId) return json({ error: 'unauthorized' }, 401);
  const db = env && env.DB;
  if (!db) return json({ error: 'unavailable' }, 503);
  if (method === 'GET') {
    const stored = await readWatchSettings(db, userId);
    return json({ watchSettings: stored || defaultWatchSettings(0) });
  }
  let raw = '';
  try { raw = await request.text(); } catch (e) { return json({ error: 'bad_settings' }, 400); }
  if (raw.length > MAX_BODY) return json({ error: 'bad_settings' }, 400);
  let body = null;
  try { body = JSON.parse(raw); } catch (e) { return json({ error: 'bad_settings' }, 400); }
  const picked = payloadOf(body);
  if (picked.error) return json({ error: 'bad_settings' }, 400);
  const current = await readWatchSettings(db, userId) || defaultWatchSettings(0);
  const patched = applyPatch(current, picked.src);
  if (patched.error) return json({ error: 'bad_settings' }, 400);
  const saved = await writeWatchSettings(db, userId, patched.settings, serverNow(env));
  return json({ watchSettings: saved });
}

/**
 * Add watchSettings to a GET /watch/workout body. Leaves code and checkMode alone.
 * A stored row replaces the legacy restAlert with its number. With no row, a
 * legacy string such as "tone" stays on the response and is mirrored as a number.
 */
export function attachWatchSettings(workout, stored) {
  const base = workout && typeof workout === 'object' ? { ...workout } : {};
  if (stored) {
    const settings = pack(stored, Number(stored.rev) || 0);
    return { ...base, restAlert: settings.restAlert, watchSettings: settings };
  }
  const settings = defaultWatchSettings(0);
  const mirrored = parseRestAlert(base.restAlert);
  if (mirrored != null) settings.restAlert = mirrored;
  if (base.restAlert == null) base.restAlert = settings.restAlert;
  return { ...base, watchSettings: settings };
}

/** Read the account row and attach it to the legacy workout JSON. */
export async function enrichWorkout(db, userId, legacyBody) {
  const stored = await readWatchSettings(db, userId);
  return attachWatchSettings(legacyBody, stored);
}
