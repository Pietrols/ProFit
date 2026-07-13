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
  durationSeconds?: number | null; // time-based exercises (Group D)
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
  isCustom?: boolean;
  // Custom-workout timer settings (Group D); null/absent on template plans.
  defaultRestSeconds?: number | null;
  workIntervalSeconds?: number | null;
  autoAdvanceTimers?: boolean;
}

/**
 * Estimate a session's duration in minutes: work + rest across all sets.
 * A set's work is its duration (time-based) or a ~40s rep-set default.
 */
export function estimateDayMinutes(
  day: Pick<PlanDay, 'exercises'>,
  defaultWorkSeconds = 40,
): number {
  let seconds = 0;
  for (const e of day.exercises) {
    const work = e.durationSeconds ?? defaultWorkSeconds;
    seconds += e.sets * (work + e.restSeconds);
  }
  return Math.round(seconds / 60);
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
