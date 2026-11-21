# Simple Lift for Galaxy Watch (Wear OS)

Standalone Wear OS app, package `app.simplelift.wear`. `minSdk` 30, `targetSdk` 35. It is not a Play Store build. The debug APK is for ADB or Wi-Fi debugging on a watch you own.

The phone flow is unchanged: sign in, choose Samsung Galaxy Watch, then enter the 6-digit code this watch shows. The watch asks the existing Worker for that code (`POST /pair/request`) and polls `POST /pair/status` until the phone claims it. The token is stored in encrypted preferences.

## What the watch does

- Loads today's workout from `GET /watch/workout`. When `GET /watch/plans` is deployed it also lists the rest of the saved plans. Until then a missing plans route falls back to today's workout. Sample days are not shown.
- Logs sets, rest, and completion with the same live snapshot as the Garmin app (`GET`/`POST /watch/live`) and posts `SR1` to `POST /watch/result` when you finish.
- Check each set starts rest. Check each exercise does not; it shows Start rest, same as No checks. The round border drains for the original rest length.
- Heart rate is a small mark and BPM at the top edge during a workout. It uses a Health Services strength session (`ExerciseType.STRENGTH_TRAINING`), which also keeps the sensor on and records calories. The chip is hidden when there is no reading. The app asks for `BODY_SENSORS` (and activity recognition) when a workout starts.
- Auto-detect sets is off until you turn it on in Settings. In Check each set it counts reps from the accelerometer and, after at least 3 reps and about 3 seconds of stillness, logs the set and starts rest. Undo stays up for 5 seconds. The thresholds match the Garmin app (`AUTO_MIN_REPS` 3, stillness 3 s, undo 5 s, 8 s debounce, ignore counts above 30 or above planned + 8). The phone has no auto-detect setting. If an account blob later contains `settings.autoDetectSets`, the watch follows that value unless you changed the toggle more recently.

When the Android wrapper is installed and includes `capacitor/garmin-link`, live snapshots, watch settings, and pairing travel over the Wear OS data layer (`MessageClient` plus a data item at `/simplelift/live`). If the phone app is open and the watch is paired to that phone, the watch sends its code over that link and the phone claims it. After a token is stored, opening either app, rebooting, or coming back in range sends hello again and does not show a new code. Unpair is the only way back to the code screen. The workout list shows Connected or Not connected. The server is used when that phone node is not reachable.

`worker/live-routes.js`, `worker/watch-plans.js`, and `worker/migrations/0006_live_session.sql` are not deployed from this repo.

## Build

Needs JDK 17 and the Android SDK (compile SDK 35). From this directory:

```
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

The debug APK is `app/build/outputs/apk/debug/app-debug.apk`. CI (`.github/workflows/wear.yml`) builds that APK and runs the unit tests.

## Install on a watch

USB:

```
adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Wi-Fi debugging (Wear OS 3 and newer): on the watch, Settings → Developer options → Wireless debugging. Pair, then connect:

```
adb pair WATCH_IP:PAIR_PORT
adb connect WATCH_IP:DEBUG_PORT
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Developer options have to be on (Settings → About → Software → tap Build number). The watch and the computer have to be on the same network.

## Emulator

A Wear OS 5 (API 34) image is enough to see pairing, the workout, rest, and Settings. Debug builds accept a preview extra so the layout can be opened without an account. Release builds ignore it.

```
adb shell am start -n app.simplelift.wear/.MainActivity --es preview workout --ei bpm 78
adb shell am start -n app.simplelift.wear/.MainActivity --es preview rest --ei bpm 78
adb shell am start -n app.simplelift.wear/.MainActivity --es preview settings
```

`--ei bpm` is only a stand-in when Health Services has not produced a sample yet. A real reading replaces it. Heart rate on an emulator can also use synthetic providers:

```
adb shell am broadcast -a whs.USE_SYNTHETIC_PROVIDERS com.google.android.wearable.healthservices
```

A real Galaxy Watch is still required to confirm optical heart rate, auto-detect against a real set, and pairing over the phone's Wear OS node.
