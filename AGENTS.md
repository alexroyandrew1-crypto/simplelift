# Simple Lift

Simple Lift is a free workout log. This repository is the static progressive web app plus the watch apps that talk to it. The PWA has no build step and no bundler. GitHub Pages publishes the `main` branch root with the legacy Jekyll build (`https://alexroyandrew1-crypto.github.io/simplelift/`).

Do not merge to `main`, deploy, or upload a store build without the owner's review. Pages deploys from `main`. That includes `wrangler deploy`, the Play Store / APK, and the Connect IQ store. Open a pull request and stop.

## Parts

### PWA (this repo, site root)

Vanilla JavaScript, one HTML shell, and one stylesheet. Scripts are classic globals, not ES modules. `app.js` is split by area into `app-shell.js`, `app-views.js`, `app-workout.js`, `app-session.js`, `app-actions.js`, and `app-boot.js`, loaded in that order from `index.html`. They stay classic scripts because `live.js` and `sync.js` call the same globals and there is no bundler. Data stays in `localStorage` (`simplelift_v1`) through `Store` in `store.js`. The app works offline.

The service worker in `sw.js` precaches the shell (`C`, currently `simplelift-v40`) and keeps OCR files in a separate cache (`simplelift-ocr-1`). `APP_VERSION` in `config.js` is `40` and must stay in step with `C`.

English strings live in `i18n.js`. The other languages are `lang-es.js`, `lang-fr.js`, `lang-de.js`, `lang-pt.js`, `lang-it.js`, `lang-nl.js`, `lang-ru.js`, `lang-tr.js`, `lang-pl.js`, `lang-zh.js`, `lang-ja.js`, `lang-ko.js`, `lang-ar.js`, `lang-hi.js`, and `lang-id.js`. Arabic is RTL.

`errors.js` keeps a local ring buffer of `window.onerror` and `unhandledrejection`, shown and exported from Settings. It POSTs to `/errors` only when `API_URL` is set and the user is signed in. The route is documented in `docs/ERRORS.md` and is not implemented in this repo. No third-party tracker.

Run the site locally with `python3 -m http.server 8000`.

### Tests

`npm test` runs, in order:

- `node --test worker/watch-settings.test.mjs` (no browser)
- `node test/live-snap.mjs` (snapshot rules, including exact kilogram weights)
- `node test/errors.mjs` (the local error log)
- `node test/session-persist.mjs` (Puppeteer)
- `node test/check-mode.mjs` (Puppeteer)
- `node test/watch-settings-ui.mjs` (Puppeteer)
- `node test/pair-entry.mjs` (Puppeteer)

The Puppeteer files need `puppeteer-core` and Chrome (`CHROME`, or `/usr/local/bin/google-chrome`).

Wear OS unit tests: `cd wear && ./gradlew :app:testDebugUnitTest`.

There is no Monkey C test runner in this repo. Garmin snapshot behaviour is covered by the phone and Wear tests plus review of `garmin/source/LiftModel.mc`.

### Android wrapper

A separate Android APK wraps this PWA. It is not in this repository. Do not add Gradle files for that wrapper, manifests, or signing config here. `capacitor/garmin-link` is the optional Capacitor plugin that wrapper includes. `live.js` calls `Capacitor.Plugins.GarminLink` when the plugin is present (live snapshots, watch settings, and pairing over Garmin Bluetooth and the Wear OS data layer). In the browser the plugin is missing and the phone uses the server. A web change that the wrapper loads still has to follow the service-worker and translation rules below.

### Cloudflare Workers + D1 API

Optional accounts and sync. `API_URL` in `config.js` points at the public Worker. With an empty `API_URL` the client never contacts a server. `localStorage` stays the source of truth, including while offline.

`worker/` in this repo holds modules to merge into that Worker (live session routes, watch plans, watch settings). It is not a second product. Do not put Worker secrets, D1 credentials, or API keys in this repo. The client already ships the public Worker URL, the PayPal donate link, and the support email; those are not secrets. Do not add new ones.

The account backup is still one JSON blob per user, re-uploaded on each change, with tombstones capped at 2000 in `store.js`. The replacement is planned in `docs/SYNC-REDESIGN.md` and is not built yet.

### Watches in this repo

Both watch apps live here. They are not a separate checkout.

- `garmin/` is the Connect IQ app (Monkey C) for the Forerunner 955 (`fr955`), `minApiLevel` 3.3.0. `garmin/source/Workout.mc` parses `SL1`. `garmin/source/LiftModel.mc` reads and writes the live snapshot.
- `wear/` is the Galaxy Watch / Wear OS app (Kotlin, Jetpack Compose). `wear/app/src/main/kotlin/app/simplelift/wear/model/` parses the same snapshot and the `SL1` / `SR1` codes.

The PWA talks to a watch in two ways:

- Manual codes: `SL1~…` (day sent to the watch) and `SR1~…` (result pasted back). Weights in those codes are still whole pounds. Do not change that shape unless both watch apps change with it.
- Live snapshot: JSON on Bluetooth and on `/live`. Each set keeps legacy whole pounds in `w` for an older watch, plus `u` (`kg` or `lb`) and `v` (the value to the hundredth). New readers use `u` and `v`. A snapshot with only `w` still plate-rounds the way it used to. `61.25` kg round-trips.
- Pairing: the watch asks `POST /pair/request` and polls `POST /pair/status`. The phone claims the 6-digit code from Settings → Watch with `POST /pair/claim` (`Sync.pairClaim`). The old phone call `POST /pair/start` is gone.

## Working rules

- Reproduce a bug before fixing it. State what you did to see it fail, then show it passing.
- Keep each fix small and scoped to one bug. Do not mix a drive-by refactor into a bugfix.
- Run the existing test, or add a test that covers the bug, before calling the fix done. `npm test` is the PWA check. A UI-only change that the script cannot reach still needs the screenshots below. A Wear logic change also needs `./gradlew :app:testDebugUnitTest`.
- For any UI change, take before and after screenshots and attach them to the pull request. Check a narrow phone width as well as a desktop width. Arabic (`dir="rtl"`) matters when layout changes.
- Bump the service worker cache version on any change to a file the site ships. That means `C` in `sw.js` and `APP_VERSION` in `config.js`, together. If you add a new file the app loads, add it to the `FILES` list in `sw.js` and bump both. Language files are cached by version too; a new string still needs a version bump so updated clients download it. Files that are not part of the shipped app (this file, `docs/**`, `.cursor/**`) do not need a bump.
- Never publish, deploy, or merge without the owner's review. That includes merging to `main` (Pages deploys from `main`), `wrangler deploy`, the Play Store / APK, and the Connect IQ store. Open a pull request and stop.
- Never commit secrets, keys, or passwords. No `.env`, API tokens, signing keys, or Worker secrets.
- Keep every user-facing string translated in every supported language: the English source in `i18n.js` and all fifteen `lang-*.js` files. Do not leave a new key in English only.
- No medical claims. Simple Lift is a workout log. Do not describe it as diagnosis, treatment, rehab, or medical advice. Suggested weights and injury keyword filters are estimates, not guidance a person should follow instead of a clinician. Legal copy lives in `legal.js`; do not soften the health disclaimer.

## GitHub Pages

Pages uses Jekyll because this repo has no `.nojekyll`. Jekyll does not publish paths that start with a dot. `.cursor/` (rules, skills, `BUGBOT.md`, the ECC install) must stay a dot path. Do not add `.nojekyll`: that would turn off Jekyll and start publishing `.cursor/`, including `mcp.json`.

`AGENTS.md` and `docs/` are normal files, so Pages will serve them the same way it already serves `README.md`. Do not put secrets in them. They are not in the service worker `FILES` list and must not be added there.

Do not add agent config to `index.html`, `sw.js`, or `manifest.json`.

## Agent files in this repo

- `.cursor/` from the Everything Claude Code minimal Cursor profile (`./install.sh --profile minimal --target cursor`). That profile is large on purpose. Do not expand it to the full catalog.
- `.cursor/rules/*cursorrules*.mdc` and `security-devsecops-ssdls-appsec.mdc` are a short selection from awesome-cursorrules. Project notes at the top of each file override any stack those upstream rules assume (no Tailwind, no new auth framework, no build step).
- `.cursor/skills/clean-code/`, `code-complete/`, and `the-pragmatic-programmer/` are on-demand skills from agent-rules-books. Read the skill when the task matches. Do not paste those books into this file.
