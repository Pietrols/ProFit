// Writes images/jobs.json: one job per exercise, most looked-for first, with everything Codex
// needs to make its image (prompt, figure, steps, target file). Rules: docs/IMAGE_RULES.md.
//
//   node scripts/build-image-jobs.mjs

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { exercises } = JSON.parse(await readFile(join(ROOT, 'mobile/src/features/exercises/data/library.json'), 'utf8'));

// Female or male from the id, so it never changes between runs and splits the library about evenly.
const figureFor = (id) => (createHash('sha1').update(id).digest()[0] % 2 === 0 ? 'female' : 'male');

// Movements that read better from the front (rules: Camera).
const FRONT = /lateral raise|side lateral|jumping jack|side lunge|lateral lunge|side bend|side bridge|side plank|lateral band walk|abduct|adduct/i;

const STYLE =
  'Realistic 3D render of a faceless, anatomically proportioned human mannequin with a smooth matte mid-grey surface (#9A9A9A), ' +
  'no clothing, hair or facial features. One figure only. Plain seamless light grey studio backdrop (#E6E6E6) with a soft floor shadow, ' +
  'soft even studio light from the front left, camera level at hip height. Whole figure and equipment in frame, centred, about 75% of the frame height. ' +
  'Equipment realistic in dark charcoal metal and black rubber with no branding. Square 1:1. No text, letters, numbers, arrows, logos or watermarks.';

const jobs = [...exercises]
  .sort((a, b) => (a.popularity ?? Infinity) - (b.popularity ?? Infinity) || a.name.localeCompare(b.name))
  .map((x, i) => {
    const figure = figureFor(x.id);
    const view = FRONT.test(x.name) ? 'front view' : 'side view';
    const equipment = x.equipment && x.equipment !== 'body only' ? `using a ${x.equipment}` : 'with no equipment';
    return {
      order: i + 1,
      id: x.id,
      name: x.name,
      common: x.common,
      figure,
      view,
      equipment: x.equipment,
      steps: x.instructions,
      file: `images/incoming/${x.id}.png`,
      prompt:
        `A ${figure} figure performing the exercise "${x.name}" ${equipment}, ${view}, shown at the single key moment that best explains the movement ` +
        `(usually the hardest point), with correct, safe technique. ${STYLE}`,
    };
  });

await writeFile(join(ROOT, 'images/jobs.json'), JSON.stringify(jobs, null, 1) + '\n');
const females = jobs.filter((j) => j.figure === 'female').length;
console.log(`Wrote ${jobs.length} jobs (${jobs.filter((j) => j.common).length} common first; ${females} female, ${jobs.length - females} male)`);
