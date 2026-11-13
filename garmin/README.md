# Simple Lift for Garmin (Forerunner 955)

Connect IQ watch app, Monkey C, `minApiLevel` 3.3.0. One product: `fr955`.

The watch logs sets, runs a rest timer, and syncs with the Simple Lift phone app. Logging never needs a network. Sync uses whichever link is actually up: the phone's Garmin Connect app (Bluetooth) or the watch's own Wi-Fi.

## Screens

- **Pair.** Shown until the watch has a token or the Android app says hello over Bluetooth. The watch asks the server for a 6-digit code and shows it. With the Android app installed, that code is sent to the phone over Bluetooth and claimed for you. On the web, or if Bluetooth is down: Settings → Watch → Pair a watch → Garmin, then confirm that code. The code lasts 10 minutes. The bottom button is **Retry** until a code is on screen, then **Not now** (you can train without pairing). The line under the code says whether the phone is linked, the watch is on Wi-Fi, or neither is available. A failure says "No phone or Wi-Fi" or "Wi-Fi up, no server" / "Phone up, no server". It does not show a raw HTTP code.
- **Picker.** Synced workout, then a typed backup code, then six sample days. Those samples are a built-in plan so the watch is usable with no account. They are labeled **Sample**, not as your plan. Up is the previous workout (button and swipe). Down or swipe left is the next. The line under the arrows is the check-off mode (tap it to change). Hold UP for settings: Chime, Vibration, check-off, rest alert, rep count, and auto-log. The status line uses the full width.
- **Workout.** Exercise, set, weight × reps (always pounds; the phone converts kg when it builds the code). In **Check each set**, the checkmark logs that set and starts rest. In **Check each exercise**, the checkmark logs every set of the exercise with the weight and reps on screen, then starts one rest. In **No checks**, the button says REST and only starts the timer; Finish logs every planned set. Tap the top of the screen to change mode. The word **Rest** stays on screen with the countdown. While a weight or rep is highlighted, swipe or drag up increases it and down decreases it (5 lb or 1 rep). Swipe left/right changes exercise. If there is no phone and no watch Wi-Fi, the bottom line says **Saved on watch**.
- **Finish.** Back opens Finish & save / Keep lifting / Exit, save later. Saving writes a FIT strength activity and tries to send the result.
- **Done.** Shows the sync result in plain language ("Sent to Simple Lift", "Saved on watch", "Will send when link is back"). The backup `SR1~…` code is on this screen so you can type it into the phone if the send did not go through. It is also stored as the Last result setting.

## Sync

- Unpaired: `POST /pair/request`, then `POST /pair/status` until the phone claims the code. The Android app can claim that code over Bluetooth without typing it.
- Paired: `GET /watch/workout` on launch. `POST /watch/result` when a workout is saved. A failed send stays queued (except HTTP 400, which the server rejected) and is retried on the next launch.
- Live: while a workout is open the watch sends a snapshot over Bluetooth (`Communications.transmit`) and, if paired, `POST /watch/live`. It polls `GET /watch/live` every few seconds. The phone does the same on `POST /live` and `GET /live` when Bluetooth is down. Those routes are in `worker/live-routes.js` and are not deployed from this repo.
- The SL1 code may end with `~#set`, `~#exercise`, or `~#none`. That is the phone's check-off default. Older builds skip a segment that is not an exercise.
- `apiUrl` defaults to the Simple Lift worker. Leave it unless support asks you to change it.

## Rest alert, chime, and vibration

Mode = watch menu choice > `restAlert` from the server's GET /watch/workout JSON ("vibrate" | "tone" | "both", or 0/1/2) > app setting `restAlert` (0/1/2, default 0 = vibrate).
Tone uses Attention.playTone (watch speaker/beeper; follows the watch's own Tones setting). Connect IQ cannot send audio to Bluetooth headphones.
Master switches (default ON): picker hold-UP → Settings → **Chime** and **Vibration**, or the Garmin Connect settings `chime` and `vibration` (watch menu wins). Every tone goes through `playChime()`. Every buzz goes through `buzz()`. Turning Chime off silences rest-end tones even if Rest alert is Tone or Vibrate + tone.

## Build

Needs the Connect IQ SDK and a Forerunner 955 device, plus a developer key that is not in this repo.

```
monkeyc -d fr955 -f monkey.jungle -o bin/SimpleLift.prg -y developer_key.der
connectiq &
monkeydo bin/SimpleLift.prg fr955
```

`bin/` outputs are not committed.
