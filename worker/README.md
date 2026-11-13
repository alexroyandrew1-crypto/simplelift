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
