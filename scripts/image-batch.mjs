// Prints the next exercises that still need an image, most looked-for first, with a ready prompt
// for each. Make the images, save them as mobile/assets/exercises/<id>.webp, then run
// build-image-manifest.mjs. See docs/IMAGE_GUIDE.md.
//
//   node scripts/image-batch.mjs [count=10]

import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const count = Number(process.argv[2] ?? 10);
const { exercises } = JSON.parse(await readFile(join(ROOT, 'mobile/src/features/exercises/data/library.json'), 'utf8'));
const done = new Set((await readdir(join(ROOT, 'mobile/assets/exercises'))).filter((f) => !f.startsWith('.')).map((f) => basename(f, extname(f))));

const STYLE =
  'Flat vector illustration, square 1:1, warm off-white background (#F3EEE6). One gender-neutral athlete ' +
  'in a plain dark-brown outfit drawn with simple shapes and no face details. Side or three-quarter view ' +
  'at the hardest point of the movement. Terracotta (#E57A52) highlights on the working muscles. ' +
  'Equipment in muted grey. No text, no logos, no brand marks, no background scenery.';

const todo = exercises
  .filter((x) => !done.has(x.id))
  .sort((a, b) => (a.popularity ?? Infinity) - (b.popularity ?? Infinity) || a.name.localeCompare(b.name));

console.log(`${done.size} of ${exercises.length} exercises have images. Next ${Math.min(count, todo.length)}:\n`);
for (const x of todo.slice(0, count)) {
  const equipment = x.equipment && x.equipment !== 'body only' ? ` using a ${x.equipment}` : ' with no equipment';
  console.log(`${x.id}.webp`);
  console.log(`  ${x.name}${equipment}. Working muscles: ${x.primary.join(', ') || 'whole body'}.`);
  console.log(`  First step: ${x.instructions[0] ?? 'n/a'}`);
  console.log(`  Prompt: "${x.name}"${equipment}, highlighting ${x.primary.join(' and ') || 'the whole body'}. ${STYLE}\n`);
}
