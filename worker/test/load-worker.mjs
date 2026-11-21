// Copy every worker source file into a build directory before importing it.
// index.js is written as index.mjs so Node loads it as ESM even if a parent package is CommonJS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.join(here, '..');

export function stageWorker(buildDir) {
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'package.json'), '{"type":"module"}\n');
  const src = path.join(root, 'src');
  for (const name of fs.readdirSync(src)) {
    if (!/\.(js|mjs)$/.test(name)) continue;
    const dest = name === 'index.js' ? 'index.mjs' : name;
    fs.copyFileSync(path.join(src, name), path.join(buildDir, dest));
  }
  return buildDir;
}

/** PWA legal.js. SIMPLELIFT_LEGAL overrides the path for a checkout that is not this repo. */
export function appLegalPath() {
  if (process.env.SIMPLELIFT_LEGAL) return process.env.SIMPLELIFT_LEGAL;
  return path.join(root, '..', 'legal.js');
}
