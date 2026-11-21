# Sync redesign

Plan only. Do not build this on the server from this document. The phone still uploads one JSON blob today.

## What is wrong now

The account API keeps one JSON document per user. The phone sends that whole document on every change (`PUT /data` from `sync.js`). `Sync.now` copies `Store.db`, deletes `active` (a live workout must not be revived on another phone), and uploads the rest: settings, every plan, and every history workout.

The deployed API caps that document at 1 MB (`MAX_BLOB`). A long history hits the cap and later saves fail. The constant is not in this repo's `worker/` slice; `worker/` currently has the live-session and watch modules, and the blob route is the deployed Worker.

Deletes are an array on the blob, `deleted`, in `store.js`. `tomb()` drops anything past 2000 ids (`db.deleted.slice(-2000)`), and `wipeEverywhere` does the same. A delete that falls off that list can come back, because the server merge unions plans and history by id and only drops ids that are still in `deleted`.

`updatedAt` is one clock for the whole document. Two phones that each change a different workout overwrite each other's unrelated rows.

## Target

One row per plan and one row per finished workout, plus one settings row. Each row has its own revision. The client sends only the rows that changed. Tombstones are rows, not a capped array.

`active` stays on the phone. Live sets already use `/live` and must not move into these rows.

## Schema (D1)

```sql
CREATE TABLE plan_row (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  body TEXT,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE workout_row (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  body TEXT,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE settings_row (
  user_id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE sync_change (
  user_id TEXT NOT NULL,
  cursor INTEGER NOT NULL,
  kind TEXT NOT NULL,          -- plan | workout | settings
  record_id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, cursor)
);

CREATE TABLE sync_state (
  user_id TEXT PRIMARY KEY,
  cursor INTEGER NOT NULL,
  migrated INTEGER NOT NULL DEFAULT 0
);
```

`body` is the same object the phone already stores, without the parent arrays. A plan body is `{id,name,created,next,notes,days:[...]}`. A workout body is one history entry `{id,date,planId,planName,dayName,units,minutes,fromWatch,exercises:[...]}`. Settings body is the current `settings` object. `deleted = 1` means the body is null and the id must disappear on every device.

`cursor` is a per-user integer. Each accepted write increments it and inserts one `sync_change` row. There is no cap on `sync_change` or on tombstones. A later cleanup may drop a tombstone only after every device cursor for that user is past it. That is not a fixed 2000.

## API

Phone bearer token, same as `/data`.

### `GET /sync?cursor=<n>&limit=200`

Returns changes with `cursor` greater than the query, oldest first.

```json
{
  "cursor": 140,
  "more": false,
  "changes": [
    {"cursor": 138, "kind": "workout", "id": "m5k2", "rev": 3, "deleted": 0, "body": {}},
    {"cursor": 139, "kind": "plan", "id": "p1", "rev": 2, "deleted": 1, "body": null},
    {"cursor": 140, "kind": "settings", "id": "settings", "rev": 9, "deleted": 0, "body": {}}
  ]
}
```

`body` is omitted when `deleted` is 1. `limit` defaults to 200 and caps at 500.

### `POST /sync`

```json
{
  "baseCursor": 140,
  "changes": [
    {"kind": "workout", "id": "m5k2", "rev": 4, "deleted": 0, "updatedAt": 1730000000000, "body": {}}
  ]
}
```

The server accepts a change when the row is missing or `rev` is greater than the stored rev. It then advances `sync_state.cursor` and appends `sync_change`.

```json
{
  "cursor": 141,
  "accepted": [{"kind": "workout", "id": "m5k2", "rev": 4}],
  "conflicts": []
}
```

If the stored rev is already greater, the change is listed in `conflicts` with `serverRev` and `body` (or `deleted`) and is not written. The client replaces its copy with the server row and does not retry the same rev.

Equal revs with different bodies: the higher `updatedAt` wins. If those match too, keep the server row and return it as a conflict. Workouts are almost always edited on one phone, so last-revision-wins is enough. Plans can conflict when two phones edit the same plan; the loser reloads the winner.

`POST /watch/next` (or the existing watch-code field, moved off the blob) still receives the next `SL1` code when the next training day changes. That code is not a plan row.

## Client

`store.js` today bumps one `updatedAt` and calls `Sync.soon()`, which re-uploads everything.

- Add `rev` on each plan and each history workout. A missing rev is 1.
- On create or edit, set `rev` to the previous rev plus 1 and record the id in a local dirty list (`simplelift_sync_dirty`).
- On delete, keep `{kind, id, rev}` in a local tombstone list that is not sliced at 2000. The next push sends `deleted: 1`.
- Save `syncCursor` next to the auth record. `GET /sync?cursor=` applies each change, then stores the returned cursor. Apply a plan or workout only when its rev is newer. Ignore `active` if a change ever contains it.
- `Sync.now` pushes the dirty list, then pulls. It does not `PUT` the whole database.
- Settings are one dirty flag. A unit change, rest-timer change, or background change bumps `settings.rev`.
- Export / import still reads and writes the full local document. Import sets every rev to at least 1 and marks every id dirty so the next sync pushes them.
- The 2000 cap in `tomb()` and `wipeEverywhere` comes out when the client speaks `/sync`. Until then it stays, so old servers still see the array they merge today.

## Migration

1. Add the tables beside the existing user blob. Do not drop the blob column.
2. For each user with `sync_state.migrated = 0`, parse the blob once:
   - each plan becomes `plan_row` at rev 1
   - each history workout becomes `workout_row` at rev 1
   - `settings` becomes `settings_row` at rev 1
   - each id in `deleted` becomes a tombstone row at rev 1
   - set `cursor` to 1 and `migrated` to 1
   - skip ids that are both present and tombstoned; the tombstone wins
3. Dual-write. `PUT /data` from an old phone still arrives. Diff the blob against the rows, write the rows that changed, and append `sync_change`. Rebuild a compatibility blob from the rows for `GET /data`.
4. New phones send `POST /sync` and stop calling `PUT /data`. Gate them with the app cache version that ships the client change (the version after this plan is implemented, not this document).
5. When a rebuilt blob would pass 1 MB, `GET /data` returns `413` and `{ "error": "upgrade_required" }`. The old client already surfaces server errors. The new client never needs the blob.
6. After the old cache versions are gone, stop writing the blob. Keep reading it only for a user who is not migrated yet.

A device that was offline across the cutover still has the blob in `localStorage`. Its first `/sync` push sends every local plan and workout at their local rev. The server accepts a rev greater than the migrated rev 1, so the offline edits land. A row the server already has at a higher rev comes back as a conflict and the phone keeps the server copy.

## Rollout order

1. Ship the tables and the one-time expand. Old phones keep using `PUT /data`. No client change.
2. Dual-write `PUT /data` into the rows, and rebuild the blob for `GET /data`, still under `MAX_BLOB`.
3. Ship the phone client that uses `/sync`, with the tombstone cap removed, and bump the service-worker cache.
4. Watch apps do not change for this. They already read `/watch/workout` and `/live`, not the account blob.
5. Return `upgrade_required` when the compatibility blob cannot be built under 1 MB.
6. Remove the blob write last, after old clients are no longer in the field.
