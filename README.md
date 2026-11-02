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
- `config.js`: `DONATE_URL`. Leave it empty to hide the optional Donate button in Settings → Support (only the message shows).
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
