// node scripts/ai-status.mjs  -> AI spend vs cap and today's calls, read from the live D1 (no secrets needed beyond wrangler login)
import { execFileSync } from 'node:child_process'; import fs from 'node:fs';
const q = sql => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'simplelift', '--remote', '--json', '--command', sql], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
const cap = +((fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8').match(/AI_SPEND_CAP_USD\s*=\s*"([\d.]+)"/) || [])[1] || 20);
const s = q('SELECT total_usd_micros,calls,updated_at FROM ai_spend WHERE id=1')[0] || { total_usd_micros: 0, calls: 0, updated_at: 0 };
const day = new Date().toISOString().slice(0, 10);
const t = q(`SELECT (SELECT count FROM ai_usage WHERE user_id='*global*' AND day='${day}') g, (SELECT COUNT(*) FROM ai_usage WHERE day='${day}' AND user_id<>'*global*') u`)[0];
console.log(JSON.stringify({ spent_usd: s.total_usd_micros / 1e6, cap_usd: cap, remaining_usd: Math.max(0, cap - s.total_usd_micros / 1e6), calls: s.calls,
  today_calls: t.g || 0, today_users: t.u || 0, last_call: s.updated_at ? new Date(s.updated_at).toISOString() : null }, null, 1));
