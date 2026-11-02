# Simple Lift

A free, simple workout tracker. Static PWA with no build step and no external libraries. Works offline and can be installed on Android ("Add to Home screen").

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
- `sw.js`: offline cache. **Bump `C` whenever you change files.**
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
