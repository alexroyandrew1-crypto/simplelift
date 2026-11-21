# Watch pairing (Simple Lift v31 / Garmin v5)

All watches pair to the same Simple Lift account. Workouts and results sync through that account, so a phone and any number of watches stay in step.

## How pairing works now

1. An unpaired watch asks the Simple Lift server for a short-lived 6-digit code (`POST /pair/request`, with a device id, model, and a name). The watch shows the code and polls `POST /pair/status` until the phone claims it, or until the code expires (about 10 minutes).
2. On the phone, signed in, Settings → Pair watch is “Enter the code shown on your watch.” The phone claims the code with the account’s sign-in token (`POST /pair/claim`). The code is single-use. Too many wrong tries are locked out; requests are rate-limited.
3. The server stores a watch token of its own (device id, model, a user-renamable name, paired date, last seen). Each watch has its own row. Any valid, unrevoked watch token is accepted on `/watch/*`. Last-seen is updated when the watch fetches a workout or sends a result.
4. Settings → My watches lists each watch (name, model, last sync) and a Remove button. Remove asks for confirmation and revokes only that watch. A revoked watch gets 401, shows “Not paired,” and can request a new code.
5. Existing watch tokens from earlier versions keep working. The old phone-creates-a-code path (`POST /pair/start` and an unauthenticated `POST /pair/claim`) is removed. The phone, the Galaxy Watch app, and the Garmin app all use `POST /pair/request` and a signed-in claim. The SR1 result backup on the watch is unchanged.
6. A wrong claim is counted for that code and for that account. After 5 failures in 15 minutes the code is deleted and the account cannot claim again until the window passes. Limits are per IP and per account or device. There is no single global counter that one caller can fill to stop pairing for everyone. Codes stay 6 digits because every current client shows and checks 6 digits.

## Other platforms

Apple Watch and Wear OS could pair automatically through the phone app (the phone already has the account, so it can register the watch without typing a code). Garmin could do the same if the Android app added the Connect IQ Mobile SDK, which can talk to a Connect IQ watch without going through a pairing code. In every case, watches would still sync to the same Simple Lift account.

## Deploying the Worker (not done in this release package)

Do not run this against production until you are ready to publish.

1. Review `migrations/0005_watches.sql`. It adds watch columns on `tokens` (`id`, `device_id`, `model`, `name`, `last_seen`, `revoked`), backfills ids, and creates `pair_requests`. It is written to run once on the current production schema.
2. Apply it to the production D1 database, for example:
   `npx wrangler d1 execute simplelift --remote --file migrations/0005_watches.sql`
3. Deploy the Worker (`npx wrangler deploy`). Phone app v31 and Garmin v5 should ship after the migration is in place, so new pairing and “My watches” have the tables they need. Older watch tokens continue to work after the migration.

Test only with `wrangler dev`, a local D1, or a separate test Worker — not production.
