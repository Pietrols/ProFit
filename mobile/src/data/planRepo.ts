// The active plan is cached on device as a JSON document so it is viewable
// (and startable, Phase 4) offline. It is server-owned data — the device
// never edits it locally, so a blob beats normalized tables here.
import { getMeta, setMeta } from './exercisesRepo';
import { DbLike, Exercise, ExerciseCategory } from './types';

export interface PlanExercise {
  id: string;
  order: number;
  exerciseId: string;
  sets: number;
  reps: string;
  restSeconds: number;
  exercise: Exercise;
}

export interface PlanDay {
  id: string;
  dayIndex: number;
  name: string;
  category: ExerciseCategory;
  exercises: PlanExercise[];
}

export interface Plan {
  id: string;
  name: string;
  context: 'home' | 'gym';
  days: PlanDay[];
}

const KEY = 'plan.active';

export async function saveActivePlan(db: DbLike, plan: Plan | null): Promise<void> {
  await setMeta(db, KEY, JSON.stringify(plan));
}

export async function getActivePlanLocal(db: DbLike): Promise<Plan | null> {
  const raw = await getMeta(db, KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Plan | null;
  } catch {
    return null;
  }
}
