// Personal records + week streak (AUDIT M2). Pure computation over locally
// stored sessions so everything works offline.
import { WorkoutSessionPayload } from '../../data/workoutTypes';

export interface ExerciseRecord {
  exerciseId: string;
  /** heaviest completed set */
  maxWeightKg: number | null;
  maxWeightReps: number | null;
  /** most reps in a single completed set (any weight) */
  maxReps: number | null;
  /** best estimated 1RM across completed weighted sets */
  bestE1RmKg: number | null;
}

/**
 * Epley estimated one-rep max: w × (1 + reps/30). Reps are capped at 12 —
 * beyond that the formula drifts into fiction, so higher-rep sets estimate
 * as if 12 (standard practice, keeps the trend honest).
 */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + Math.min(reps, 12) / 30);
}

/** Fold sessions into per-exercise records (completed sets only). */
export function computeRecords(
  sessions: WorkoutSessionPayload[],
): Map<string, ExerciseRecord> {
  const records = new Map<string, ExerciseRecord>();
  for (const s of sessions) {
    for (const e of s.exercises) {
      if (e.skipped) continue;
      let rec = records.get(e.actualExerciseId);
      if (!rec) {
        rec = {
          exerciseId: e.actualExerciseId,
          maxWeightKg: null,
          maxWeightReps: null,
          maxReps: null,
          bestE1RmKg: null,
        };
        records.set(e.actualExerciseId, rec);
      }
      for (const set of e.sets) {
        if (!set.completed) continue;
        const reps = set.actualReps ?? 0;
        if (reps > (rec.maxReps ?? 0)) rec.maxReps = reps;
        if (set.weightKg != null && reps > 0) {
          if (set.weightKg > (rec.maxWeightKg ?? 0)) {
            rec.maxWeightKg = set.weightKg;
            rec.maxWeightReps = reps;
          }
          const e1rm = estimateOneRepMax(set.weightKg, reps);
          if (e1rm > (rec.bestE1RmKg ?? 0)) rec.bestE1RmKg = e1rm;
        }
      }
    }
  }
  return records;
}

export interface NewRecord {
  exerciseId: string;
  kind: 'weight' | 'reps' | 'e1rm';
  value: number;
}

/** Records in `session` that beat every prior session's best. */
export function detectNewRecords(
  priorSessions: WorkoutSessionPayload[],
  session: WorkoutSessionPayload,
): NewRecord[] {
  const prior = computeRecords(priorSessions);
  const current = computeRecords([session]);
  const out: NewRecord[] = [];
  for (const [exerciseId, rec] of current) {
    const old = prior.get(exerciseId);
    if (rec.maxWeightKg != null && rec.maxWeightKg > (old?.maxWeightKg ?? 0)) {
      out.push({ exerciseId, kind: 'weight', value: rec.maxWeightKg });
    } else if (rec.bestE1RmKg != null && rec.bestE1RmKg > (old?.bestE1RmKg ?? 0)) {
      out.push({ exerciseId, kind: 'e1rm', value: rec.bestE1RmKg });
    } else if (
      rec.maxWeightKg == null && // bodyweight movement — reps are the record
      rec.maxReps != null &&
      old != null &&
      rec.maxReps > (old.maxReps ?? 0)
    ) {
      out.push({ exerciseId, kind: 'reps', value: rec.maxReps });
    }
  }
  return out;
}

/** ISO-ish week key: the Monday of the week containing `d`, as yyyy-mm-dd. */
function weekKey(d: Date): string {
  const day = new Date(d);
  const offset = (day.getDay() + 6) % 7; // Mon=0 … Sun=6
  day.setDate(day.getDate() - offset);
  day.setHours(0, 0, 0, 0);
  return day.toISOString().slice(0, 10);
}

/**
 * Consecutive training weeks (≥1 session), counting back from this week.
 * The current week counts if it has a session; an empty current week doesn't
 * break the streak (it's still in progress).
 */
export function computeWeekStreak(
  sessions: { startedAt: string }[],
  now: Date = new Date(),
): number {
  const weeks = new Set(sessions.map((s) => weekKey(new Date(s.startedAt))));
  let streak = 0;
  const cursor = new Date(now);
  if (!weeks.has(weekKey(cursor))) cursor.setDate(cursor.getDate() - 7); // grace for the in-progress week
  while (weeks.has(weekKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}
