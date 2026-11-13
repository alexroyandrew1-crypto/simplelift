// Live workout routes for the Simple Lift Cloudflare Worker.
// NOT DEPLOYED by this change. Merge these handlers into the existing Worker
// (the one behind https://simplelift-api.alexroyandrew1.workers.dev) and run the
// SQL once on its D1 database. Do not replace the whole Worker with this file.
//
// Why these routes exist: the phone never publishes `active` on PUT /data, and the
// watch only downloaded a plan (GET /watch/workout) and posted a finished SR1
// (POST /watch/result). Nothing carried an in-progress set, edit, rest, skip, or
// check mode. These routes store one snapshot per user, separate from `active`.
//
// Wire-up (pseudocode for the existing fetch switch):
//   const live = await liveRoutes(request, env, { userIdFromBearer, userIdFromWatch });
//   if (live) return live;
//
// Also, on the existing GET /watch/workout response, add:
//   checkMode: one of "set" | "exercise" | "none" from the user's settings.checkMode
// The phone already sends that field inside the synced data blob, and it also
// appends ~#set|exercise|none to the SL1 watch code. The watch reads either one.
//
// Assumed tables (change the SQL if the real names differ):
//   sessions(token TEXT, user_id TEXT)          -- phone bearer token
//   watches(id TEXT, user_id TEXT, token TEXT)  -- watch bearer token
// The list/remove watch APIs already imply a watches table keyed by id.

export const LIVE_SQL = `
CREATE TABLE IF NOT EXISTS live_session (
  user_id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  snap TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

const MODES = ['set', 'exercise', 'none'];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

function normMode(m) {
  return MODES.includes(m) ? m : 'set';
}

function bearer(request) {
  const h = request.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

// Last-rev-wins. A missing or older snapshot is returned as-is so the sender
// can apply the winner. `active` is never written.
export async function saveSnap(db, userId, snap) {
  if (!snap || typeof snap !== 'object' || snap.t !== 'snap' || !snap.id) return null;
  const rev = snap.rev | 0;
  const row = await db.prepare('SELECT rev, snap FROM live_session WHERE user_id = ?').bind(userId).first();
  if (row && (row.rev | 0) > rev) {
    try { return JSON.parse(row.snap); } catch (e) { return null; }
  }
  const text = JSON.stringify(snap);
  await db.prepare(
    'INSERT INTO live_session (user_id, rev, snap, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET rev = excluded.rev, snap = excluded.snap, updated_at = excluded.updated_at'
  ).bind(userId, rev, text, Date.now()).run();
  return snap;
}

export async function readSnap(db, userId) {
  const row = await db.prepare('SELECT snap FROM live_session WHERE user_id = ?').bind(userId).first();
  if (!row || !row.snap) return null;
  try { return JSON.parse(row.snap); } catch (e) { return null; }
}

export async function readCheckMode(db, userId) {
  // The account blob is the source of the default. Column name in the existing
  // users/data table may be `data` (JSON). Adjust this query to match.
  const row = await db.prepare('SELECT data FROM user_data WHERE user_id = ?').bind(userId).first();
  if (!row || !row.data) return null;
  try {
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const m = data && data.settings && data.settings.checkMode;
    return MODES.includes(m) ? m : null;
  } catch (e) { return null; }
}

/**
 * @param {Request} request
 * @param {{ DB: D1Database }} env
 * @param {{ userIdFromBearer: (token: string) => Promise<string|null>, userIdFromWatch: (token: string) => Promise<string|null> }} auth
 * @returns {Promise<Response|null>} null when the path is not a live route
 */
export async function liveRoutes(request, env, auth) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const phone = path === '/live';
  const watch = path === '/watch/live';
  if (!phone && !watch) return null;
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Method' }, 405);
  const token = bearer(request);
  if (!token) return json({ error: 'Not signed in' }, 401);
  const userId = phone ? await auth.userIdFromBearer(token) : await auth.userIdFromWatch(token);
  if (!userId) return json({ error: 'Not signed in' }, 401);
  const db = env.DB;
  if (request.method === 'GET') {
    const snap = await readSnap(db, userId);
    const checkMode = normMode(await readCheckMode(db, userId) || (snap && snap.mode));
    return json({ snap, checkMode });
  }
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const snap = body && body.snap;
  if (!snap || typeof snap !== 'object') return json({ error: 'Missing snap' }, 400);
  const saved = await saveSnap(db, userId, snap);
  return json({ snap: saved, checkMode: normMode(saved && saved.mode) });
}
