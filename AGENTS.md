# Simple Lift

Simple Lift is a free workout log. This repository is the static progressive web app. It has no build step and no bundler. GitHub Pages publishes the `main` branch root with the legacy Jekyll build (`https://alexroyandrew1-crypto.github.io/simplelift/`).

Other parts of the product live outside this repo. Do not add their source here, and do not change this PWA in a way that assumes their files are present.

## Parts

### PWA (this repo)

Vanilla JavaScript, one HTML shell, and one stylesheet. Scripts are classic globals, not ES modules. Data stays in `localStorage` (`simplelift_v1`) through `Store` in `store.js`. The app works offline. The service worker in `sw.js` precaches the shell (`C`, currently `simplelift-v31`) and keeps OCR files in a separate cache (`simplelift-ocr-1`). `APP_VERSION` in `config.js` must stay in step with `C`.

English strings live in `i18n.js`. The other languages are `lang-es.js`, `lang-fr.js`, `lang-de.js`, `lang-pt.js`, `lang-it.js`, `lang-nl.js`, `lang-ru.js`, `lang-tr.js`, `lang-pl.js`, `lang-zh.js`, `lang-ja.js`, `lang-ko.js`, `lang-ar.js`, `lang-hi.js`, and `lang-id.js`. Arabic is RTL.

`npm test` runs `node test/session-persist.mjs` (Puppeteer against a local static server). Run locally with `python3 -m http.server 8000`.

### Android wrapper

A separate Android APK wraps this PWA. It is not in this repository. Do not add Gradle files, manifests, or signing config here. A web change that the wrapper loads still has to follow the service-worker and translation rules below.

### Cloudflare Workers + D1 API

Optional accounts and sync. `API_URL` in `config.js` points at `https://simplelift-api.alexroyandrew1.workers.dev`. The Worker and its D1 database are not in this repository. With an empty `API_URL` the client never contacts a server. `localStorage` stays the source of truth, including while offline. Do not put Worker secrets, D1 credentials, or API keys in this repo. The client already ships the public Worker URL, the PayPal donate link, and the support email; those are not secrets. Do not add new ones.

### Garmin watch app

A Connect IQ app written in Monkey C, for the Forerunner 955 (`fr955`), with `minApiLevel` 3.3.0. The watch source is not in this repository (`watch.js` refers to `simplelift-garmin/source/Workout.mc`).

This PWA talks to the watch in two ways:

- Manual codes: `SL1~…` (day sent to the watch) and `SR1~…` (result pasted back). Weights in those codes are whole pounds.
- Optional pairing: a 6-digit code from the account API. The watch then downloads the next workout and posts results.

Do not change the `SL1` / `SR1` shape in this repo unless the watch app is updated to match. The watch app is a separate review.

## Working rules

- Reproduce a bug before fixing it. State what you did to see it fail, then show it passing.
- Keep each fix small and scoped to one bug. Do not mix a drive-by refactor into a bugfix.
- Run the existing test, or add a test that covers the bug, before calling the fix done. `npm test` is the current check. A UI-only change that the script cannot reach still needs the screenshots below.
- For any UI change, take before and after screenshots and attach them to the pull request. Check a narrow phone width as well as a desktop width. Arabic (`dir="rtl"`) matters when layout changes.
- Bump the service worker cache version on any change to a file the site ships. That means `C` in `sw.js` and `APP_VERSION` in `config.js`, together. If you add a new file the app loads, add it to the `FILES` list in `sw.js` and bump both. Language files are cached by version too; a new string still needs a version bump so updated clients download it. Files that are not part of the shipped app (this file, `.cursor/**`) do not need a bump.
- Never publish, deploy, or merge without the owner's review. That includes merging to `main` (Pages deploys from `main`), `wrangler deploy`, the Play Store / APK, and the Connect IQ store. Open a pull request and stop.
- Never commit secrets, keys, or passwords. No `.env`, API tokens, signing keys, or Worker secrets.
- Keep every user-facing string translated in every supported language: the English source in `i18n.js` and all fifteen `lang-*.js` files. Do not leave a new key in English only.
- No medical claims. Simple Lift is a workout log. Do not describe it as diagnosis, treatment, rehab, or medical advice. Suggested weights and injury keyword filters are estimates, not guidance a person should follow instead of a clinician. Legal copy lives in `legal.js`; do not soften the health disclaimer.

## GitHub Pages

Pages uses Jekyll because this repo has no `.nojekyll`. Jekyll does not publish paths that start with a dot. `.cursor/` (rules, skills, `BUGBOT.md`, the ECC install) must stay a dot path. Do not add `.nojekyll`: that would turn off Jekyll and start publishing `.cursor/`, including `mcp.json`.

`AGENTS.md` is a normal markdown file, so Pages will serve it the same way it already serves `README.md`. Do not put secrets in it. It is not in the service worker `FILES` list and must not be added there.

Do not add agent config to `index.html`, `sw.js`, or `manifest.json`.

## Agent files in this repo

- `.cursor/` from the Everything Claude Code minimal Cursor profile (`./install.sh --profile minimal --target cursor`). That profile is large on purpose. Do not expand it to the full catalog.
- `.cursor/rules/*cursorrules*.mdc` and `security-devsecops-ssdls-appsec.mdc` are a short selection from awesome-cursorrules. Project notes at the top of each file override any stack those upstream rules assume (no Tailwind, no new auth framework, no build step).
- `.cursor/skills/clean-code/`, `code-complete/`, and `the-pragmatic-programmer/` are on-demand skills from agent-rules-books. Read the skill when the task matches. Do not paste those books into this file.
