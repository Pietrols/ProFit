import type { Exercise } from './types';

// The built-in library, bundled with the app (data/library.json, made by
// scripts/build-exercise-library.mjs). Loaded on first use, so the app starts without parsing it.

type LibraryFile = {
  version: number;
  source: { name: string; url: string; commit: string; license: string };
  exercises: Omit<Exercise, 'photoId'>[];
};

let cache: { version: number; list: Exercise[]; byId: Map<string, Exercise> } | null = null;

function load() {
  if (!cache) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const file = require('./data/library.json') as LibraryFile;
    const list = file.exercises.map((x) => ({ ...x, photoId: null }) as Exercise);
    cache = { version: file.version, list, byId: new Map(list.map((x) => [x.id, x])) };
  }
  return cache;
}

export const builtInExercises = (): Exercise[] => load().list;
export const builtInExercise = (id: string): Exercise | null => load().byId.get(id) ?? null;
export const libraryVersion = (): number => load().version;
