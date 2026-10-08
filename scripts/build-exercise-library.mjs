// Builds ProFit's built-in exercise library from free-exercise-db plus ProFit's own additions.
//
//   node scripts/build-exercise-library.mjs            downloads the pinned commit
//   node scripts/build-exercise-library.mjs <file>     uses a local copy of dist/exercises.json
//
// Output: mobile/src/features/exercises/data/library.json (checked in, so app builds never download).
// Source: github.com/yuhonas/free-exercise-db, released into the public domain (Unlicense). Its
// images are not used (docs/DECISIONS.md D4). See docs/phases/PHASE_3.md.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_COMMIT = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5';
const SOURCE_URL = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${SOURCE_COMMIT}/dist/exercises.json`;
const OUTPUT = join(ROOT, 'mobile/src/features/exercises/data/library.json');

// Bump when the output changes in a way phones should notice (ids removed, fields renamed).
const LIBRARY_VERSION = 1;

// The exercises most people look for, most looked-for variant of each movement first. Their order
// is the `popularity` rank search uses, and the order images are made in.
const COMMON_ORDER = [
  'Barbell_Squat', 'Barbell_Full_Squat', 'Front_Barbell_Squat', 'Goblet_Squat', 'Bodyweight_Squat', 'Smith_Machine_Squat', 'Hack_Squat',
  'Barbell_Bench_Press_-_Medium_Grip', 'Dumbbell_Bench_Press', 'Incline_Dumbbell_Press', 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'Decline_Barbell_Bench_Press', 'Close-Grip_Barbell_Bench_Press', 'Dumbbell_Flyes', 'Cable_Crossover',
  'Barbell_Deadlift', 'Romanian_Deadlift', 'Stiff-Legged_Dumbbell_Deadlift', 'Sumo_Deadlift', 'Good_Morning', 'Hyperextensions_Back_Extensions',
  'Pullups', 'Chin-Up', 'Wide-Grip_Lat_Pulldown', 'Close-Grip_Front_Lat_Pulldown', 'Bent_Over_Barbell_Row', 'One-Arm_Dumbbell_Row',
  'Seated_Cable_Rows', 'Inverted_Row', 'Face_Pull', 'Reverse_Flyes', 'Barbell_Shrug', 'Dumbbell_Shrug',
  'Pushups', 'Push-Ups_With_Feet_Elevated', 'Incline_Push-Up', 'Dips_-_Triceps_Version', 'Dips_-_Chest_Version', 'Bench_Dips',
  'Standing_Military_Press', 'Seated_Dumbbell_Press', 'Dumbbell_Shoulder_Press', 'Arnold_Dumbbell_Press', 'Side_Lateral_Raise', 'Front_Dumbbell_Raise',
  'Barbell_Curl', 'Dumbbell_Bicep_Curl', 'Hammer_Curls', 'Preacher_Curl', 'Triceps_Pushdown', 'Triceps_Pushdown_-_Rope_Attachment',
  'EZ-Bar_Skullcrusher', 'Standing_Dumbbell_Triceps_Extension',
  'Leg_Press', 'Leg_Extensions', 'Lying_Leg_Curls', 'Seated_Leg_Curl', 'Standing_Calf_Raises', 'Seated_Calf_Raise',
  'Barbell_Walking_Lunge', 'Dumbbell_Lunges', 'Bodyweight_Walking_Lunge', 'Dumbbell_Step_Ups', 'Barbell_Hip_Thrust', 'Butt_Lift_Bridge',
  'Single_Leg_Glute_Bridge', 'Kettlebell_One-Legged_Deadlift', 'One-Arm_Kettlebell_Swings', 'Farmers_Walk',
  'Plank', 'Side_Bridge', 'Crunches', 'Hanging_Leg_Raise', 'Russian_Twist', 'Mountain_Climbers', 'Ab_Roller', 'Cable_Crunch', 'Pallof_Press',
  'Dead_Bug', 'Superman', 'Air_Bike',
  'Rope_Jumping', 'Jogging_Treadmill', 'Bicycling_Stationary', 'Rowing_Stationary', 'Walking_Treadmill', 'Box_Jump_Multiple_Response',
  'ProFit_Burpee', 'ProFit_Jumping_Jacks', 'ProFit_Wall_Sit', 'ProFit_Bird_Dog',
];
const COMMON = new Set(COMMON_ORDER);

// Names people search for, where the dataset's wording differs.
const RENAME = {
  Pullups: 'Pull-Up',
  'Chin-Up': 'Chin-Up',
  Pushups: 'Push-Up',
  Butt_Lift_Bridge: 'Glute Bridge',
  Air_Bike: 'Bicycle Crunch',
  Hammer_Curls: 'Hammer Curl',
  Farmers_Walk: "Farmer's Walk",
  Rope_Jumping: 'Jump Rope',
  Jogging_Treadmill: 'Treadmill Jog',
  Walking_Treadmill: 'Treadmill Walk',
  Bicycling_Stationary: 'Stationary Bike',
  Rowing_Stationary: 'Rowing Machine',
  Box_Jump_Multiple_Response: 'Box Jump',
  Hyperextensions_Back_Extensions: 'Back Extension',
  'Barbell_Bench_Press_-_Medium_Grip': 'Barbell Bench Press',
  'Barbell_Incline_Bench_Press_-_Medium_Grip': 'Incline Barbell Bench Press',
  'Dips_-_Triceps_Version': 'Triceps Dip',
  'Dips_-_Chest_Version': 'Chest Dip',
  'Triceps_Pushdown_-_Rope_Attachment': 'Rope Triceps Pushdown',
};

const LOADED = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'kettlebells', 'e-z curl bar', 'medicine ball', 'bands', 'other']);
const DISTANCE_CARDIO = new Set(['Jogging_Treadmill', 'Walking_Treadmill', 'Bicycling_Stationary', 'Rowing_Stationary']);

// What a set records by default. Phase 4 lets a plan change it per exercise.
function trackingFor(x) {
  if (x.category === 'cardio') return DISTANCE_CARDIO.has(x.id) || x.equipment === 'machine' ? 'distance_time' : 'time';
  if (x.category === 'stretching') return 'time';
  if (x.force === 'static' && x.equipment !== 'barbell' && x.equipment !== 'dumbbell' && x.id !== 'ProFit_Bird_Dog') return 'time';
  if (!x.equipment || x.equipment === 'body only' || x.equipment === 'foam roll' || x.equipment === 'exercise ball') return 'reps';
  return LOADED.has(x.equipment) ? 'weight_reps' : 'reps';
}

const clean = (s) => s.replace(/\s+/g, ' ').trim();

async function loadSource(path) {
  if (path) return JSON.parse(await readFile(path, 'utf8'));
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${SOURCE_URL}`);
  return res.json();
}

const source = await loadSource(process.argv[2]);
const additions = JSON.parse(await readFile(join(ROOT, 'scripts/exercise-additions.json'), 'utf8'));

const seen = new Set();
const exercises = [...source.map((x) => ({ ...x, origin: 'free-exercise-db' })), ...additions.map((x) => ({ ...x, origin: 'profit' }))]
  .map((x) => {
    if (seen.has(x.id)) throw new Error(`Duplicate id ${x.id}`);
    seen.add(x.id);
    return {
      id: x.id,
      name: RENAME[x.id] ?? clean(x.name),
      category: x.category,
      equipment: x.equipment ?? null,
      level: x.level,
      force: x.force ?? null,
      mechanic: x.mechanic ?? null,
      primary: x.primaryMuscles,
      secondary: x.secondaryMuscles,
      instructions: x.instructions.map(clean).filter(Boolean),
      tracking: trackingFor(x),
      common: COMMON.has(x.id),
      popularity: COMMON.has(x.id) ? COMMON_ORDER.indexOf(x.id) + 1 : null,
      origin: x.origin,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'en'));

const missing = [...COMMON].filter((id) => !seen.has(id));
if (missing.length) throw new Error(`Common ids not in the data: ${missing.join(', ')}`);

const library = {
  version: LIBRARY_VERSION,
  source: { name: 'free-exercise-db', url: 'https://github.com/yuhonas/free-exercise-db', commit: SOURCE_COMMIT, license: 'Unlicense (public domain)' },
  exercises,
};

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, JSON.stringify(library) + '\n');
const counts = exercises.reduce((acc, x) => ((acc[x.tracking] = (acc[x.tracking] ?? 0) + 1), acc), {});
console.log(`Wrote ${exercises.length} exercises (${exercises.filter((x) => x.common).length} common) to ${OUTPUT}`, counts);
