# Bugbot review notes for Simple Lift

This is a static vanilla JavaScript PWA. GitHub Pages serves the `main` branch. There is no build. The Android wrapper, the Cloudflare Workers + D1 API, and the Garmin Connect IQ Monkey C app (Forerunner 955, `fr955`, `minApiLevel` 3.3.0) are not in this repo. Review only what this diff can affect, and say so when a change also needs those other trees (watch code format `SL1`/`SR1`, `API_URL` contract).

Do not request a merge. The owner reviews before anything is published.

## Service worker

Flag any change to a file the site ships (`index.html`, `style.css`, `app.js`, `sw.js`, `config.js`, `i18n.js`, `lang-*.js`, `store.js`, `manifest.json`, icons, and the rest of the `FILES` array in `sw.js`) when `C` in `sw.js` and `APP_VERSION` in `config.js` were not both incremented. A new shipped file that is missing from `FILES` is a bug: offline installs will not get it. Agent files (`AGENTS.md`, `.cursor/**`) are not shipped app files and do not need a cache bump. Do not suggest adding them to `FILES`.

## Translations

Any new or changed user-facing string must exist in English (`i18n.js`) and in every `lang-*.js` file: es, fr, de, pt, it, nl, ru, tr, pl, zh, ja, ko, ar, hi, id. A key left in English only is a review failure. Arabic must stay RTL (`dir` from `i18n.js`). Do not hardcode a new English sentence in `app.js` or `index.html`.

## Secrets

Reject keys, passwords, tokens, `.env` files, signing material, and Worker or D1 secrets. The public Worker URL, PayPal donate link, and support email in `config.js` are already client-visible; a new credential next to them is not acceptable. Do not log session tokens or passwords.

## Mobile layout

The app is a phone PWA with a bottom tab bar. Flag horizontal overflow, fixed widths that exceed a narrow viewport, tap targets that collide with the tab bar, and text that clips. Check RTL: physical `left`/`right` in new CSS is a problem when a logical property would work. Screenshot evidence belongs on the PR for UI diffs.

## Offline behaviour

Core logging, plans, and history must work with no network. `localStorage` is the source of truth. Flag a change that requires the Workers API for a path that used to work offline, that drops the cache fallback in `sw.js`, or that mixes files from two cache versions. OCR may download on first use; the shell must not.

## Also flag

- A bugfix that is not tied to a reproduced failure, or that edits unrelated code.
- A UI change with no before/after screenshots.
- Medical or rehab claims, or copy that treats suggested weights or injury filters as clinical advice.
- A new dependency or a build step. This site is static files.
- `.nojekyll`. Adding it would publish `.cursor/` on Pages.
