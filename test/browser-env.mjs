// Chrome and screenshot paths for the PWA tests.
// CHROME overrides the binary. ARTIFACTS_DIR overrides where screenshots go.
// Screenshots stay out of docs/ unless ARTIFACTS_DIR points there.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function chromePath() {
  const fromEnv = process.env.CHROME || process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/local/bin/google-chrome',
    '/usr/local/bin/chromium'
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      const found = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (found && fs.existsSync(found)) return found;
    } catch (e) { /* try the next name */ }
  }
  throw new Error('Set CHROME to a Chrome or Chromium binary');
}

export function legalVersion(root) {
  const src = fs.readFileSync(path.join(root, 'legal.js'), 'utf8');
  const match = src.match(/"v":"([^"]+)"/);
  if (!match) throw new Error('LEGAL.v missing from legal.js');
  return match[1];
}

export function artifactDir(name) {
  const base = process.env.ARTIFACTS_DIR || path.join(os.tmpdir(), 'simplelift-shots');
  const dir = path.join(base, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
