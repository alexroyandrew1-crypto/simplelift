# Simple Lift for Garmin (Forerunner 955)

Connect IQ watch app, Monkey C, `minApiLevel` 3.3.0. One product: `fr955`.

The watch logs sets, runs a rest timer, and syncs with the Simple Lift phone app. Logging never needs a network. Sync uses whichever link is actually up: the phone's Garmin Connect app (Bluetooth) or the watch's own Wi-Fi.

## Screens

- **Pair.** Shown until the watch has a token. The watch asks the server for a 6-digit code and shows it. On the phone: Settings → Watch → Pair a watch → Garmin, then confirm that code. The code lasts 10 minutes. The bottom button is **Retry** until a code is on screen, then **Not now** (you can train without pairing). The line under the code says whether the phone is linked, the watch is on Wi-Fi, or neither is available. A failure says "No phone or Wi-Fi" or "Wi-Fi up, no server" / "Phone up, no server". It does not show a raw HTTP code.
- **Picker.** Synced workout, then a typed backup code, then six sample days. Those samples are a built-in plan so the watch is usable with no account. They are labeled **Sample**, not as your plan. Up is the previous workout (button and swipe). Down or swipe left is the next. Hold UP for rest alert, live rep count, and auto-log. The status line uses the full width.
- **Workout.** Exercise, set, weight × reps (always pounds; the phone converts kg when it builds the code). Checkmark logs the set and starts rest. The word **Rest** stays on screen with the countdown. While a weight or rep is highlighted, swipe or drag up increases it and down decreases it (5 lb or 1 rep). Swipe left/right changes exercise. If there is no phone and no watch Wi-Fi, the bottom line says **Saved on watch**.
- **Finish.** Back opens Finish & save / Keep lifting / Exit, save later. Saving writes a FIT strength activity and tries to send the result.
- **Done.** Shows the sync result in plain language ("Sent to Simple Lift", "Saved on watch", "Will send when link is back"). The backup `SR1~…` code is on this screen so you can type it into the phone if the send did not go through. It is also stored as the Last result setting.

## Sync

- Unpaired: `POST /pair/request`, then `POST /pair/status` until the phone claims the code.
- Paired: `GET /watch/workout` on launch. `POST /watch/result` when a workout is saved. A failed send stays queued (except HTTP 400, which the server rejected) and is retried on the next launch.
- `apiUrl` defaults to the Simple Lift worker. Leave it unless support asks you to change it.

## Build

Needs the Connect IQ SDK and a Forerunner 955 device, plus a developer key that is not in this repo.

```
monkeyc -d fr955 -f monkey.jungle -o bin/SimpleLift.prg -y developer_key.der
connectiq &
monkeydo bin/SimpleLift.prg fr955
```

`bin/` outputs are not committed.
