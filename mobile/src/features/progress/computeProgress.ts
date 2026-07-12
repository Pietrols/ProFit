// Pure progress computations over locally stored session payloads.
// Everything here renders offline — no network, no server aggregation.
import { WorkoutSessionPayload } from '../../data/workoutTypes';

export interface CurvePoint {
  date: string; // ISO of the session start
  topWeightKg: number;
}

/** Per-exercise strength curve: heaviest completed set per session. */
export function strengthCurve(
  sessions: WorkoutSessionPayload[],
  exerciseId: string,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  for (const s of [...sessions].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  )) {
    const weights = s.exercises
      .filter((e) => !e.skipped && e.actualExerciseId === exerciseId)
      .flatMap((e) => e.sets)
      .filter((set) => set.completed && set.weightKg !== null)
      .map((set) => set.weightKg!);
    if (weights.length > 0) {
      points.push({ date: s.startedAt, topWeightKg: Math.max(...weights) });
    }
  }
  return points;
}

/** Exercises that have at least one completed weighted set — curve candidates. */
export function loggedExerciseIds(sessions: WorkoutSessionPayload[]): string[] {
  const ids = new Set<string>();
  for (const s of sessions) {
    for (const e of s.exercises) {
      if (
        !e.skipped &&
        e.sets.some((set) => set.completed && set.weightKg !== null)
      ) {
        ids.add(e.actualExerciseId);
      }
    }
  }
  return [...ids].sort();
}

/** Monday 00:00 UTC of the week containing `date` — the week bucket key. */
export function weekStartOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * Completed sets per primary muscle for the week containing `ref`.
 * A set trains every primary muscle of its actual exercise.
 */
export function weeklyMuscleVolume(
  sessions: WorkoutSessionPayload[],
  musclesOf: (exerciseId: string) => string[],
  ref: Date = new Date(),
): { muscle: string; sets: number }[] {
  const week = weekStartOf(ref);
  const counts = new Map<string, number>();
  for (const s of sessions) {
    if (weekStartOf(new Date(s.startedAt)) !== week) continue;
    for (const e of s.exercises) {
      if (e.skipped) continue;
      const completed = e.sets.filter((set) => set.completed).length;
      if (completed === 0) continue;
      for (const muscle of musclesOf(e.actualExerciseId)) {
        counts.set(muscle, (counts.get(muscle) ?? 0) + completed);
      }
    }
  }
  return [...counts.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}

export interface AdherenceSummary {
  completed: number;
  planned: number;
  pct: number; // 0-100, capped at 100
}

/**
 * Sessions completed vs planned over the trailing `weeks` full weeks
 * (including the current, pro-rated as a full week — honest but simple).
 */
export function adherence(
  sessions: WorkoutSessionPayload[],
  plannedPerWeek: number,
  weeks = 4,
  ref: Date = new Date(),
): AdherenceSummary {
  const cutoff = new Date(ref.getTime() - weeks * 7 * 86400_000);
  const completed = sessions.filter(
    (s) => new Date(s.startedAt) >= cutoff && new Date(s.startedAt) <= ref,
  ).length;
  const planned = plannedPerWeek * weeks;
  return {
    completed,
    planned,
    pct: planned === 0 ? 100 : Math.min(100, Math.round((completed / planned) * 100)),
  };
}

/**
 * Consecutive weeks (walking back from the current week) hitting the planned
 * session count. The in-progress current week counts if already met, and
 * doesn't break the streak while still incomplete.
 */
export function streakWeeks(
  sessions: WorkoutSessionPayload[],
  plannedPerWeek: number,
  ref: Date = new Date(),
): number {
  if (plannedPerWeek <= 0) return 0;
  const perWeek = new Map<string, number>();
  for (const s of sessions) {
    const wk = weekStartOf(new Date(s.startedAt));
    perWeek.set(wk, (perWeek.get(wk) ?? 0) + 1);
  }

  let streak = 0;
  const cursor = new Date(ref);
  const currentWeek = weekStartOf(cursor);
  if ((perWeek.get(currentWeek) ?? 0) >= plannedPerWeek) streak += 1;
  cursor.setUTCDate(cursor.getUTCDate() - 7);

  for (;;) {
    const wk = weekStartOf(cursor);
    if ((perWeek.get(wk) ?? 0) >= plannedPerWeek) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 7);
    } else {
      break;
    }
  }
  return streak;
}
