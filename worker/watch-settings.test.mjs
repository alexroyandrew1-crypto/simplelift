// Endpoint tests for per-account watch settings.
// Phone: GET/PUT /watch/settings (account bearer).
// Watch: POST /watch/settings (watch bearer, same auth as /watch/result).
// GET /watch/workout keeps code, restAlert, and checkMode, and adds watchSettings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  watchSettingsRoutes,
  attachWatchSettings,
  enrichWorkout,
  defaultWatchSettings
} from './watch-settings.mjs';

function memoryDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      const text = String(sql);
      return {
        bind(...args) {
          return {
            async first() {
              if (!/SELECT/i.test(text)) throw new Error('first() on ' + text);
              const row = rows.get(args[0]);
              return row ? { body: row.body, rev: row.rev } : null;
            },
            async run() {
              if (!/INSERT/i.test(text)) throw new Error('run() on ' + text);
              const [userId, body, rev] = args;
              const cur = rows.get(userId);
              if (cur && cur.rev > rev) return { success: true, meta: { changes: 0 } };
              rows.set(userId, { body, rev });
              return { success: true, meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };
}

function authFor() {
  const phone = { 'phone-a': 'user-a', 'phone-b': 'user-b' };
  const watch = { 'watch-a': 'user-a', 'watch-b': 'user-b' };
  return {
    async userIdFromBearer(token) { return phone[token] || null; },
    async userIdFromWatch(token) { return watch[token] || null; }
  };
}

function envFor(now = 1_700_000_000_000) {
  const db = memoryDb();
  const clock = { t: now };
  return { DB: db, now: () => clock.t, clock };
}

function call(env, method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.authorization = 'Bearer ' + token;
  let payload;
  if (raw != null) payload = raw;
  else if (body !== undefined) payload = JSON.stringify(body);
  if (payload != null) headers['content-type'] = 'application/json';
  const request = new Request('https://simplelift.test' + path, { method, headers, body: payload });
  return watchSettingsRoutes(request, env, authFor());
}

async function json(res) {
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  return { status: res.status, data };
}

const FULL = {
  chime: false,
  vibration: true,
  autoDetectSets: true,
  showHr: false,
  repDetect: false,
  saveActivity: false,
  restAlert: 2
};

test('GET /watch/settings requires a phone bearer token', async () => {
  const env = envFor();
  const missing = await json(await call(env, 'GET', '/watch/settings'));
  assert.equal(missing.status, 401);
  const watchTok = await json(await call(env, 'GET', '/watch/settings', { token: 'watch-a' }));
  assert.equal(watchTok.status, 401);
  const bad = await json(await call(env, 'GET', '/watch/settings', { token: 'nope' }));
  assert.equal(bad.status, 401);
});

test('GET returns defaults and rev 0 without writing a row', async () => {
  const env = envFor();
  const res = await json(await call(env, 'GET', '/watch/settings', { token: 'phone-a' }));
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.watchSettings, defaultWatchSettings(0));
  assert.equal(res.data.watchSettings.autoDetectSets, false);
  assert.equal(res.data.watchSettings.showHr, true);
  assert.equal(res.data.watchSettings.chime, true);
  assert.equal(res.data.watchSettings.vibration, true);
  assert.equal(res.data.watchSettings.repDetect, true);
  assert.equal(res.data.watchSettings.saveActivity, true);
  assert.equal(res.data.watchSettings.restAlert, 0);
  assert.equal(env.DB.rows.size, 0);
});

test('PUT sets rev to server time and GET returns the stored values', async () => {
  const env = envFor(5_000);
  const put = await json(await call(env, 'PUT', '/watch/settings', { token: 'phone-a', body: { watchSettings: FULL } }));
  assert.equal(put.status, 200);
  assert.equal(put.data.watchSettings.rev, 5_000);
  assert.equal(put.data.watchSettings.chime, false);
  assert.equal(put.data.watchSettings.restAlert, 2);
  assert.equal(put.data.watchSettings.autoDetectSets, true);
  assert.equal(put.data.watchSettings.showHr, false);
  const got = await json(await call(env, 'GET', '/watch/settings', { token: 'phone-a' }));
  assert.deepEqual(got.data.watchSettings, put.data.watchSettings);
});

test('PUT ignores a client-supplied rev', async () => {
  const env = envFor(8_000);
  const put = await json(await call(env, 'PUT', '/watch/settings', {
    token: 'phone-a',
    body: { watchSettings: Object.assign({ rev: 1 }, FULL) }
  }));
  assert.equal(put.status, 200);
  assert.equal(put.data.watchSettings.rev, 8_000);
});

test('accounts do not see each other', async () => {
  const env = envFor(9_000);
  await call(env, 'PUT', '/watch/settings', { token: 'phone-a', body: { watchSettings: FULL } });
  const other = await json(await call(env, 'GET', '/watch/settings', { token: 'phone-b' }));
  assert.equal(other.data.watchSettings.rev, 0);
  assert.equal(other.data.watchSettings.chime, true);
});

test('POST /watch/settings uses the watch token and a later rev wins', async () => {
  const env = envFor(1_000);
  await call(env, 'PUT', '/watch/settings', { token: 'phone-a', body: { watchSettings: FULL } });
  const phoneOnPost = await json(await call(env, 'POST', '/watch/settings', { token: 'phone-a', body: { chime: true } }));
  assert.equal(phoneOnPost.status, 401);
  env.clock.t = 2_000;
  const posted = await json(await call(env, 'POST', '/watch/settings', {
    token: 'watch-a',
    body: { chime: true, vibration: false, autoDetectSets: false, showHr: true, repDetect: true, saveActivity: true, restAlert: 1 }
  }));
  assert.equal(posted.status, 200);
  assert.equal(posted.data.watchSettings.rev, 2_000);
  assert.equal(posted.data.watchSettings.chime, true);
  assert.equal(posted.data.watchSettings.vibration, false);
  assert.equal(posted.data.watchSettings.restAlert, 1);
  const got = await json(await call(env, 'GET', '/watch/settings', { token: 'phone-a' }));
  assert.equal(got.data.watchSettings.rev, 2_000);
  assert.equal(got.data.watchSettings.chime, true);
  assert.equal(got.data.watchSettings.restAlert, 1);
});

test('an older server rev does not overwrite a newer write', async () => {
  const env = envFor(5_000);
  await call(env, 'POST', '/watch/settings', { token: 'watch-a', body: { chime: false, restAlert: 2 } });
  env.clock.t = 4_000;
  const stale = await json(await call(env, 'PUT', '/watch/settings', {
    token: 'phone-a',
    body: { watchSettings: { chime: true, vibration: false, restAlert: 0 } }
  }));
  assert.equal(stale.status, 200);
  assert.equal(stale.data.watchSettings.rev, 5_000);
  assert.equal(stale.data.watchSettings.chime, false);
  assert.equal(stale.data.watchSettings.restAlert, 2);
  assert.equal(stale.data.watchSettings.vibration, true);
});

test('watch token cannot PUT and a missing watch token cannot POST', async () => {
  const env = envFor();
  const put = await json(await call(env, 'PUT', '/watch/settings', { token: 'watch-a', body: { chime: false } }));
  assert.equal(put.status, 401);
  const post = await json(await call(env, 'POST', '/watch/settings', { body: { chime: false } }));
  assert.equal(post.status, 401);
});

test('bad restAlert, unknown-only body, and broken JSON are 400', async () => {
  const env = envFor();
  const badAlert = await json(await call(env, 'PUT', '/watch/settings', { token: 'phone-a', body: { restAlert: 3 } }));
  assert.equal(badAlert.status, 400);
  const words = await json(await call(env, 'POST', '/watch/settings', { token: 'watch-a', body: { restAlert: 'both' } }));
  assert.equal(words.status, 200);
  assert.equal(words.data.watchSettings.restAlert, 2);
  const none = await json(await call(env, 'PUT', '/watch/settings', { token: 'phone-a', body: { laps: true } }));
  assert.equal(none.status, 400);
  const broken = await json(await call(env, 'POST', '/watch/settings', { token: 'watch-a', raw: '{' }));
  assert.equal(broken.status, 400);
});

test('mark sets as laps is not stored', async () => {
  const env = envFor(3_000);
  const put = await json(await call(env, 'PUT', '/watch/settings', {
    token: 'phone-a',
    body: { chime: false, markSetsAsLaps: true, laps: true }
  }));
  assert.equal(put.status, 200);
  assert.equal(put.data.watchSettings.chime, false);
  assert.equal('markSetsAsLaps' in put.data.watchSettings, false);
  assert.equal('laps' in put.data.watchSettings, false);
  assert.equal(Object.keys(put.data.watchSettings).sort().join(','),
    'autoDetectSets,chime,repDetect,restAlert,rev,saveActivity,showHr,vibration');
});

test('wrong method is 405 and other paths are not handled', async () => {
  const env = envFor();
  const del = await json(await call(env, 'DELETE', '/watch/settings', { token: 'phone-a' }));
  assert.equal(del.status, 405);
  const other = await watchSettingsRoutes(new Request('https://simplelift.test/data'), env, authFor());
  assert.equal(other, null);
});

test('a partial write keeps the other stored fields', async () => {
  const env = envFor(1_000);
  await call(env, 'PUT', '/watch/settings', { token: 'phone-a', body: { watchSettings: FULL } });
  env.clock.t = 1_500;
  const put = await json(await call(env, 'POST', '/watch/settings', { token: 'watch-a', body: { showHr: true } }));
  assert.equal(put.data.watchSettings.showHr, true);
  assert.equal(put.data.watchSettings.chime, false);
  assert.equal(put.data.watchSettings.autoDetectSets, true);
  assert.equal(put.data.watchSettings.restAlert, 2);
  assert.equal(put.data.watchSettings.rev, 1_500);
});

test('GET /watch/workout keeps code, restAlert, and checkMode and adds watchSettings', async () => {
  const fresh = attachWatchSettings({ code: 'SL1~Push~3@135x8', restAlert: 'tone', checkMode: 'exercise' }, null);
  assert.equal(fresh.code, 'SL1~Push~3@135x8');
  assert.equal(fresh.restAlert, 'tone');
  assert.equal(fresh.checkMode, 'exercise');
  assert.equal(fresh.watchSettings.restAlert, 1);
  assert.equal(fresh.watchSettings.rev, 0);
  assert.equal(fresh.watchSettings.showHr, true);
  assert.equal(fresh.watchSettings.autoDetectSets, false);

  const env = envFor(6_000);
  await call(env, 'PUT', '/watch/settings', {
    token: 'phone-a',
    body: { chime: false, vibration: true, restAlert: 2, showHr: false }
  });
  const legacy = { code: 'SL1~Pull~2@95x10', restAlert: 'vibrate', checkMode: 'set' };
  const enriched = await enrichWorkout(env.DB, 'user-a', legacy);
  assert.equal(enriched.code, 'SL1~Pull~2@95x10');
  assert.equal(enriched.checkMode, 'set');
  assert.equal(enriched.restAlert, 2);
  assert.equal(enriched.watchSettings.chime, false);
  assert.equal(enriched.watchSettings.showHr, false);
  assert.equal(enriched.watchSettings.rev, 6_000);
  assert.equal(enriched.watchSettings.vibration, true);
  const untouched = await enrichWorkout(env.DB, 'user-b', legacy);
  assert.equal(untouched.restAlert, 'vibrate');
  assert.equal(untouched.watchSettings.rev, 0);
  assert.equal(untouched.watchSettings.restAlert, 0);
});

test('non-boolean fields are rejected', async () => {
  const env = envFor();
  const res = await json(await call(env, 'PUT', '/watch/settings', { token: 'phone-a', body: { chime: 'yes' } }));
  assert.equal(res.status, 400);
  assert.equal(env.DB.rows.size, 0);
});
