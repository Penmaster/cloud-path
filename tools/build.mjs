/**
 * Assembles docs/ — the folder GitHub Pages serves.
 *
 * Pages is configured to publish from `main` → `/docs`, so committing docs/
 * is the deploy. There is no CI step.
 *
 * Usage: node tools/build.mjs
 */

import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');

/* ---------- 1. regenerate the curriculum from the source of truth ------- */

const source = join(root, 'source', 'devops-study-hub.html');
if (!existsSync(source)) {
  console.error('source/devops-study-hub.html is missing. It is the source of truth — stopping.');
  process.exit(1);
}

console.log(execFileSync('node', [
  join(root, 'tools', 'extract-curriculum.mjs'),
  source,
  join(root, 'src', 'curriculum.json'),
  join(root, 'dist', 'curriculum.js'),
], { encoding: 'utf8' }));

/* ---------- 2. the logic tests must pass before anything ships ---------- */

console.log(execFileSync('node', [join(root, 'tools', 'test-store.mjs')], { encoding: 'utf8' }));

/* ---------- 3. assemble docs/ ------------------------------------------- */

rmSync(docs, { recursive: true, force: true });
mkdirSync(docs, { recursive: true });
cpSync(join(root, 'dist'), docs, { recursive: true });

// Without this, Pages runs Jekyll and ignores files beginning with an underscore.
writeFileSync(join(docs, '.nojekyll'), '');

writeFileSync(join(docs, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

/* ---------- 4. stamp the service worker with a content hash ------------- */

// Cache-first means an installed phone keeps serving whatever it cached until
// the cache NAME changes. Deriving that name from the content makes every real
// change invalidate the old cache automatically, so nobody has to remember to
// bump a version by hand.

function hashTree(dir) {
  const hash = createHash('sha256');
  const walk = (current) => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry !== 'sw.js') hash.update(entry).update(readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest('hex').slice(0, 12);
}

const buildHash = hashTree(docs);
const swPath = join(docs, 'sw.js');
const swSource = readFileSync(swPath, 'utf8');
const stamped = swSource.replace(
  /const CACHE = '[^']*';/,
  `const CACHE = 'cloud-path-${buildHash}';`,
);
if (stamped === swSource) {
  console.error('Could not stamp the cache name into sw.js — the CACHE line changed shape.');
  process.exit(1);
}
writeFileSync(swPath, stamped);

console.log('docs/ assembled');
console.log(`  cache name : cloud-path-${buildHash}`);
console.log('  deploy     : git add -A && git commit && git push');
