#!/bin/sh
# clears local rate-limit counters, then runs the full flow against `wrangler dev`
cd "$(dirname "$0")/.." && npx wrangler d1 execute simplelift --local --command "DELETE FROM rl" >/dev/null 2>&1 && node test/auth.test.mjs && node test/flow.mjs
