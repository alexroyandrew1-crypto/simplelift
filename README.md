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
