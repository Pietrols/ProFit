// Moves kept images from images/incoming/ into the app: 512 x 512 WebP at
// mobile/assets/exercises/<id>.webp, then rebuilds the app's image list.
// Only images logged as "kept" in images/log.jsonl, and not marked "rejected" later, are moved.
//
//   node scripts/finish-images.mjs

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 512;
const QUALITY = 80;

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('This script needs sharp. From the repo root run: npm install --prefix scripts');
  process.exit(1);
}

const log = existsSync(join(ROOT, 'images/log.jsonl')) ? (await readFile(join(ROOT, 'images/log.jsonl'), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const latest = new Map(log.map((entry) => [entry.id, entry.status])); // last line per id wins
const kept = [...latest].filter(([, status]) => status === 'kept').map(([id]) => id);

let moved = 0;
const missing = [];
for (const id of kept) {
  const from = join(ROOT, 'images/incoming', `${id}.png`);
  const to = join(ROOT, 'mobile/assets/exercises', `${id}.webp`);
  if (!existsSync(from)) {
    if (!existsSync(to)) missing.push(id);
    continue;
  }
  await sharp(from).resize(SIZE, SIZE, { fit: 'cover' }).webp({ quality: QUALITY }).toFile(to);
  moved += 1;
}

execFileSync(process.execPath, [join(ROOT, 'scripts/build-image-manifest.mjs')], { stdio: 'inherit' });
console.log(`Moved ${moved} images into the app.${missing.length ? ` Logged as kept but no file: ${missing.join(', ')}` : ''}`);
