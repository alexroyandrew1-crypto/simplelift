# Simple Lift

A free, simple workout tracker. Static PWA with no build step and no CDN. The only bundled library is tesseract.js (self-hosted in `ocr/`), used for reading pictures. Works offline and can be installed on Android ("Add to Home screen").

## Run locally
    python3 -m http.server 8000   # then open http://localhost:8000

## Files
- `index.html`: the app shell and bottom tab bar
- `style.css`: dark theme, one accent colour (`--acc`)
- `library.js`: the built-in exercise library (84 exercises, tagged by muscle, equipment, compound, and areas to avoid)
- `store.js`: **the data layer.** All reads and writes go through `Store` (localStorage key `simplelift_v1`). To add accounts or sync, swap `load()`/`save()` for API calls and keep the same data shape.
- `generator.js`: `generatePlan(answers)` is **the AI hook**. Today it's rule-based (full body, PPL, upper/lower and so on, filtered by equipment, injuries and session length). Replace its body with a backend call and keep the same return shape.
- `parser.js`: `parseTextPlan(text)` is **the paste-parser hook**. Rule-based for now: it reads day headings ("Day 1 - Push", "Monday: Legs"), rest days, and lines like "4x8-10", "3 sets of 8-12" or "3 sets × 10–12 reps, rest 60s". Leftover text becomes notes. Warm-up, cool-down and tips sections are skipped, and lines it can't read are reported. Replace it with an AI call and keep the same return shape.
- `config.js`: `DONATE_URL`. Currently https://paypal.me/simplelift. Leave it empty to hide the optional Donate button in Settings → Support (only the message shows).
- `changes.js`: `requestPlanChanges(plan,text)` / `applyChangeRequest` is **the change-request hook** (swap X for Y, remove X, add X to day N, more/less chest, add abs, shorter/longer, more/fewer sets, heavier/lighter). Replace it with an AI call and keep the same return shape: `{plan, changes, notUnderstood}`.
- `oldimport.js`: imports the original workout app's history (`wlog_v1`) and plan (`wplan_v1`, or `../workout/plan.json`) from the same origin. It only reads those keys, never writes them, and skips anything already imported.
- `app.js`: screens (Home, Plans/editor, Build with AI, Workout, History, Progress, Settings)
- `ocr.js`: `imageToText(file,onProgress)` is **the picture-reading hook**. It runs tesseract.js on the device after shrinking the image and boosting contrast (dark screenshots get inverted). Swap in an AI vision model later and keep the same return value (plain text).
- `ocr/`: self-hosted tesseract.js v5 (worker, WASM cores, English model `eng.traineddata.gz`, about 13 MB, Apache-2.0). It downloads only the first time someone reads a picture, then stays cached for offline use.
- `sw.js`: network-first for app files, so updates show up as soon as you are online, with a cache fallback offline. `ocr/` is cache-first in its own cache. Uses `skipWaiting` + `clients.claim`. Bump `C` (and `APP_VERSION` in config.js) on each release.
- `manifest.json`, `icon.svg`, `icon-192.png`, `icon-512.png`

## Data shape
`{version, settings:{units}, plans:[{id,name,next,days:[{id,name,rest,exercises:[{id,name,sets,repMin,repMax,weight,rest,note}]}]}], activePlanId, history:[{id,date,planName,dayName,units,minutes,exercises:[{name,lower,sets:[{w,r}]}]}], active}`

## Notes
- Data stays on the device. Use Settings → Export/Import to move it to another device.
- Switching between lb and kg changes the labels and progression steps (+5/+10 lb, +2.5/+5 kg). Saved numbers are not converted.
- Only sets marked ✓ are saved when you finish a workout.
- Deploy by copying the folder to any static host (GitHub Pages, Netlify and so on). It needs HTTPS for install and offline mode.

## Features added in v4
- Build with AI: 2–7 days a week (7 includes an active-recovery day), sessions from 20 minutes to 2 hours, free-text injuries matched by keyword (shoulder, back/disc, knee, hip, elbow, wrist, neck, ankle and synonyms), and a "Request changes" box on the review screen.
- Home opens straight to the active plan, with scrollable day tabs. Rest days show a rest message. "Edit workout" opens the day editor, with 8 preset day colours, a custom colour picker, and "Apply to all days".
- Recommended weight uses the same rules as the old app's `sug()`. No history: start weight ("Starting estimate", or "Bodyweight" if there's no start weight). Top of the rep range hit on every set: +5 lb (upper/db) or +10 lb (lower). Otherwise: repeat the weight, aim for more reps.
- Background: 8 built-in CSS gradients, a photo from the phone (shrunk to 1080 px and saved as JPEG in localStorage), or none, with a dim slider. Included in export/import.
- No ads, no trackers, no external scripts or requests.

## Features added in v5
- "+ New plan" (on the workout screen, the Plans tab, and empty Home) opens a chooser: Build my own plan / Build with AI / Copy a workout from text or picture.
- Copy a workout: paste text, or Choose a picture / Take a photo. The text is read on the phone (nothing is uploaded), shown in the editable box, then parsed into the preview editor.
- Updates: when a new version activates, a "Simple Lift was updated. Tap to reload" bar appears. Settings → About shows the version (`APP_VERSION`).

## Changes in v6
- The paste parser reads article and chat-style plans: the exercise name on one line and "4 sets × 8–10 reps" on the next, parenthetical alternatives and "A OR B" kept in the note, "Focus:"/"Time:" lines as notes, and "Rest 45–60 seconds between sets" as the default rest. It skips intro text, equipment, time breakdowns, warm-up, cool-down, tips, scaling and closing chatter, and adds an optional finisher (for example "Push-up Drop Set", 2 rounds). It also handles markdown (**bold**, ### headings, numbered or bulleted lists, "Name: 3x10", and tables). The title's parenthetical goes to plan notes, and a single-day plan is named from the title (Push, Pull, Legs and so on).

## Changes in v7
- lb is the default unit. kg only sticks after you choose it in Settings → Units (saved as `settings.unitsChosen`).
- Suggested starting weights: an exercise with no history and no typed weight gets a conservative beginner estimate from `startWeight()` in library.js (lb; dumbbells per hand; bodyweight moves show "Bodyweight"), labelled "Suggested start". Once there's history (including the old app's), the old app's `sug()` rules apply.
- Press and hold the weight or rep +/− buttons to repeat. Repeats start after 350 ms, speed up over time, and step double after 3 s. A tap is still one step.

## Changes in v8
- Build with AI → final step offers **⚡ Quick build** (built-in rules) or **💬 Use my own AI chat (free)**. The second writes a prompt from your answers (`buildAIPrompt()` in generator.js), with optional "[Changes I want]". You copy it into any chat AI, then paste the AI's answer into the "Paste AI Answer" screen, which uses the normal paste parser and review screen. The prompt asks for "Plan: …", "Day N: Name" and "Exercise — 3 sets x 8-10 reps — rest 90s" lines. No server and no key, and the app sends nothing.
- The parser now picks up a "Plan: name" line anywhere as the plan title.

## Changes in v9
- During a workout, changing a set's weight (typing, +/−, or press-and-hold) copies it to every later set of that exercise that isn't marked done. Earlier sets and done sets never change, and reps aren't copied. Turn it off in Settings → "Copy weight to later sets" (`settings.copyWeight`, on by default).

## Changes in v10
- Suggested or recommended weights in a workout show in gray (#7d8590). Once you set a set's weight (typing, +/−, hold, or marking the set done), it turns white.
- Each set tracks `ws`: `s` = suggested (gray), `c` = copied from your edit of an earlier set (white, can still be overwritten), `m` = set by you (white, protected). Editing set N marks it `m` and copies the value to later sets that aren't `m` or done. Clearing a box doesn't copy the empty value down.

## v11 — Watch link (manual) + Complete workout
- **⌚ Send to watch** (next to Edit workout, and in the active workout): shows the `SL1~…` code for that day, weights in whole lb, per-set values joined with `/`. Copy it and paste it into Simple Lift's **Workout code** setting in Garmin Connect / Connect IQ on your phone.
- **↩ Import from watch**: the watch's done screen shows a result code `SR1~Title~N@w1/w2…~…`. There is one item per exercise, N is the number of sets checked, and weights are in lb. The same code is saved to the watch setting "Last result". Paste it into the app. If that day is in progress, the first N sets are checked and their weights are set. Otherwise the result is saved to History, so progression uses it.
- The link is **manual copy and paste**. There is no automatic sync unless a native Android wrapper is built later.
- **✅ Complete workout**: after a confirm, it checks every remaining set using the weight and reps shown (gray suggestions become real values). Sets that are already checked or that you edited stay as they are. Then it finishes the workout as usual.

## v12 — Accounts + automatic sync (optional)
- **Off by default.** `API_URL` in `config.js` is empty, so the Account section is hidden and the app never contacts a server. Set it to the deployed Worker URL (see `/workspace/simplelift-api/README.md`) to turn on Settings → **Account & sync**.
- **Sign up / Sign in / Sign out**, a status line ("Synced just now"), and **⟳ Sync now**. The app syncs on open, when it comes back online or to the foreground, and 3 s after any change. localStorage stays the source of truth, so the app works fully offline and without an account.
- **Merge:** the newest copy wins for settings and the active workout. History logs and plans are combined by id, and deletions sync as tombstones (`deleted`).
- **⌚ Pair watch** shows a single-use 6-digit code (valid 10 min). Enter it in the watch app's **Pairing code** setting. After that the watch downloads the next workout (with the app's progression, sent as `watchCode` on every push) and posts results. Those results are applied on the next sync through the v11 import logic.
- **Privacy:** stored online are the email, a salted PBKDF2 password hash, and the data blob (plans, history, settings). No ads, no trackers, no third parties. There is no email password reset (the server can't send email); the UI says so and points to Export data.
- The v11 deployable files were snapshotted to `/workspace/simplelift-v11-snapshot/` before `simplelift-upload/` was updated (there is no git repo).

## v13 — Sync server live
- `API_URL` = `https://simplelift-api.alexroyandrew1.workers.dev` (Cloudflare Worker + D1 on Alex's account). Accounts and sync now show in Settings. Nothing is sent until the user signs in.
