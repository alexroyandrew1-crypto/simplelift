# Galaxy Watch Play Store prep

This is the text to paste into Play Console for the Wear OS app in `wear/`. It matches the manifest and the code that is in this repository. It is not a medical claim. Simple Lift is a workout log. Heart rate on the watch is a number shown during a session, not a diagnosis.

The account-deletion URL Play asks for is the page in this repo:

`https://alexroyandrew1-crypto.github.io/simplelift/delete.html`

That URL works after this branch is on `main` and GitHub Pages has published it. Until then, do not submit the store listing against a URL that 404s.

Package: `app.simplelift.wear`. The debug build is not the store artifact. Play needs a release build signed outside this repository. Do not commit a keystore.

## Health and permissions declaration

Play Console asks why the app uses these permissions. Suggested answers:

### BODY_SENSORS

Simple Lift reads heart rate only while a strength workout is open, so the watch can show beats per minute. The reading stays on the watch. It is not uploaded to the Simple Lift server, not stored in the account, and not used for advertising. The app does not detect falls, irregular rhythm, or any medical condition.

### ACTIVITY_RECOGNITION

The permission is declared because the Health Services strength-training session on Wear OS requires it, and because optional rep counting reads the accelerometer while a set is under way. The app does not record daily activities such as walking, running, or sleep. Motion samples stay on the watch and are not sent to the Simple Lift server. Rep counting is off until the person turns it on in watch settings.

### FOREGROUND_SERVICE and FOREGROUND_SERVICE_HEALTH

`WorkoutService` runs as a health foreground service for the length of a workout so the Health Services exercise session, the rest timer, and the set log keep going when the watch screen is off. The notification says a workout is in progress. The service stops when the workout ends. It is not used to track location. GPS is not requested.

### Other permissions

`INTERNET` is how a paired watch loads the workout and sends completed sets and the live snapshot. `VIBRATE` and `WAKE_LOCK` are for rest alerts and keeping the workout screen available. There is no background location permission.

## Data safety form

Answer from what the apps actually transmit. On-watch heart rate and accelerometer samples are not declared as collected off the device, because they are not sent off the watch.

| Question | Answer |
| --- | --- |
| Does the app collect or share any of the required user data types? | Yes. Only if the person creates a Simple Lift account or uses AI plan features. The watch can be used with an account. |
| Is all of the user data collected by your app encrypted in transit? | Yes. The app talks to the Simple Lift server over HTTPS. |
| Do you provide a way for users to request that their data be deleted? | Yes. In the app: Settings → Account & sync → Delete account. On the web: `https://alexroyandrew1-crypto.github.io/simplelift/delete.html`. Email `simpleliftsupport@gmail.com` from the account address if they cannot sign in. |

Data types to declare, for account holders:

| Data type | Collected | Shared | Purpose | Notes |
| --- | --- | --- | --- | --- |
| Email address | Yes | No, except the address is sent to Gmail or Resend to deliver a verification or reset code the person asked for | Account management | Required for an account. Not used for marketing. |
| Password | Yes, at sign-in and account deletion | No | Account management | The server stores a salted PBKDF2 hash. The password itself is not stored. |
| Fitness info (workouts) | Yes | No | App functionality | Plans, history, sets, weights, reps, rest, check mode, and one live workout snapshot. Optional. |
| Device or other IDs | Yes | No | App functionality | Watch device id, model, name, paired time, and last seen, stored with that watch's token until the watch is removed, the password is reset, or the account is deleted. |
| App interactions / photos | Only if the person uses AI import | Sent to xAI for that request | App functionality | Text or photos the person submits to build a plan. Simple Lift does not store them. Leave this off if the Wear app build does not include AI import. The Wear app in this repo does not send photos. |
| Health info: heart rate | No (not transmitted) | No | — | Shown on the watch during a workout. Not in the live snapshot and not in the completed-set result. |

Do not mark data as sold. Do not mark heart rate as collected by the server. Do not mark location: the watch app does not request GPS, and the server's `/geo` country lookup is the phone app, not this Wear app.

Ephemeral processing: rate-limit counters on the server are keyed by IP for up to an hour and are not an account profile. The Data safety form is about the app's collection. You do not need a separate "IP address" row unless Play's questionnaire asks about security logs. If it does, say IP addresses are used only to limit sign-in and pairing attempts and are not kept with the account.

Account deletion in the app removes the rows listed on `delete.html`. It does not delete the anonymous service-wide AI spend total, expired-on-their-own IP counters, mail already sent, data already sent to xAI, or workouts saved on the watch or in Garmin Connect.

## Store listing notes

- Category: health and fitness, as a workout log. The short description should say it logs sets. It should not say it measures, diagnoses, or treats anything.
- Heart-rate screenshot: a BPM chip during a workout is accurate. Do not add a claim about zones, recovery, or cardiac health.
- Content rating: no user-generated public content. Workouts are private to the account.
- Ads: none. Donations, if mentioned, are the phone app's PayPal link and are not in the Wear app.

## Before upload

1. Apply D1 migrations `worker/migrations/0006_live_session.sql` and `0007_watch_settings.sql`, then deploy the Worker. The watch calls `/watch/plans`, `/watch/live`, and `/watch/settings`.
2. Set `ADMIN_EMAILS` and `OWNER_ALERT_EMAIL` as Worker secrets if they are not already set. They are no longer in `wrangler.toml`.
3. Confirm `delete.html` is live at the URL above.
4. Build a release AAB with a keystore that is not in git.
