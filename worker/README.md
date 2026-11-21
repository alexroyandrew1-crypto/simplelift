# Live sync routes (not deployed)

The phone and the watch were not exchanging an in-progress workout. `PUT /data` strips `active` on purpose, `GET /watch/workout` only returns the next plan code, and `POST /watch/result` only runs when the watch saves. `worker/live-routes.js` adds the missing channel. It is a module to merge into the existing Worker. This pull request does not deploy it.

## Add to D1

```sql
CREATE TABLE IF NOT EXISTS live_session (
  user_id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  snap TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## Routes

| Method | Path | Auth | Body |
| --- | --- | --- | --- |
| GET | `/live` | phone bearer token | |
| POST | `/live` | phone bearer token | `{ "snap": { ... } }` |
| GET | `/watch/live` | watch bearer token | |
| POST | `/watch/live` | watch bearer token | `{ "snap": { ... } }` |

Response: `{ "snap": <stored or null>, "checkMode": "set"|"exercise"|"none" }`. A POST with an older `rev` does not overwrite; the response is the newer snapshot.

Token lookup has to match the existing tables. The module takes `userIdFromBearer` and `userIdFromWatch` so the current sessions and watches queries stay where they are. `readCheckMode` assumes the account JSON lives in `user_data.data`. Point that query at the real column if the name differs.

## Also on GET /watch/workout

Add `checkMode` from `settings.checkMode` in the user's data blob. The phone also appends `~#set`, `~#exercise`, or `~#none` to the SL1 code, which older watch builds skip.

Do not write this snapshot into `active`. A second phone must not revive a finished workout from the account blob.

## Watch settings (not deployed)

`worker/watch-settings.mjs` stores one `watchSettings` object per account. Run `WATCH_SETTINGS_SQL` once on D1. Do not deploy this from the pull request.

| Method | Path | Auth | Body |
| --- | --- | --- | --- |
| GET | `/watch/settings` | phone bearer | |
| PUT | `/watch/settings` | phone bearer | `{ "watchSettings": { ... } }` |
| POST | `/watch/settings` | watch bearer (same as `/watch/result`) | the fields, or `{ "watchSettings": { ... } }` |

`rev` is server time in milliseconds. The client cannot set it. A write with an older server timestamp does not replace a newer row.

Fields: `chime`, `vibration`, `autoDetectSets` (default false), `showHr` (default true), `repDetect`, `saveActivity`, `restAlert` (`0` vibrate, `1` tone, `2` both). There is no laps field.

On the existing `GET /watch/workout` response, call `attachWatchSettings(body, await readWatchSettings(env.DB, userId))`. That adds `watchSettings` and, once a row exists, sets the legacy `restAlert` to the same number. With no row, a legacy string such as `"tone"` stays put.

```js
const settings = await watchSettingsRoutes(request, env, { userIdFromBearer, userIdFromWatch });
if (settings) return settings;
```

`migrations/0006_live_session.sql` is the live-session table. It is not applied from this repo.

## GET /watch/plans

`worker/watch-plans.js` is a second module, also not deployed. A paired watch calls it for every saved plan and today's day. `GET /watch/workout` stays the existing route and is the fallback when `/watch/plans` is not on the server yet.

The phone Watch settings screen writes `autoDetectSets` on `watchSettings`, not in the account blob. The Galaxy Watch reads that nested object from `GET /watch/workout` (and from a plans or live body when the object is present) and applies it when `rev` is newer. `live-routes.js` and `watch-plans.js` still copy a top-level `autoDetectSets` from `settings.autoDetectSets` in the account blob when that value is a boolean, and leave the field off otherwise. The watch uses the nested `watchSettings` object when it is present, and the top-level boolean only when the nested object is absent.
