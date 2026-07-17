// Per-session "not feeling it today" dial-back (Piece 4b). Pure transform of
// a plan day for ONE session: laddered exercises swap one tier down, sets and
// numeric reps come down a notch. The saved plan is never touched — the
// transformed day only feeds the active-workout screen, and the session log
// records what was actually done (as it already does for any swap).
import { PlanDay, PlanExercise } from '../../data/planRepo';
import { Exercise } from '../../data/types';

export type ExerciseLookup = (id: string) => Exercise | null;

/** Scale a rep prescription down ~25%. Non-numeric ("hold", "AMRAP 12 min",
 * "1 min brisk / 2 min easy") prescriptions pass through unchanged. */
export function reduceReps(reps: string): string {
  const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(reps.trim());
  if (!m) return reps;
  const scale = (n: number) => Math.max(1, Math.round(n * 0.75));
  return m[2] ? `${scale(Number(m[1]))}-${scale(Number(m[2]))}` : String(scale(Number(m[1])));
}

function onLadder(ex: Exercise | null): boolean {
  return Boolean(ex?.movementPattern && (ex.easierVariantId || ex.harderVariantId));
}

export function dialBackDay(day: PlanDay, lookup: ExerciseLookup): PlanDay {
  const exercises: PlanExercise[] = day.exercises.map((pe) => {
    const local = lookup(pe.exerciseId);
    const easierId = onLadder(local) ? local?.easierVariantId : null;
    const easier = easierId ? lookup(easierId) : null;
    return {
      ...pe,
      exerciseId: easier ? easier.id : pe.exerciseId,
      exercise: easier ?? pe.exercise,
      sets: Math.max(1, pe.sets - 1),
      reps: reduceReps(pe.reps),
    };
  });
  return { ...day, exercises };
}
