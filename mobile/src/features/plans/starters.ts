import type { Database } from '../../lib/db/database';
import { builtInExercise } from '../exercises/library';
import { defaultLogFields } from './logic';
import { saveDay, savePlan, savePlanExercise } from './plans';
export type StarterExercise = { exerciseId: string; sets: number; reps?: number; time?: number };
export type StarterDay = { name: string; exercises: StarterExercise[] };
export type StarterPlan = { id: string; name: string; description: string; days: StarterDay[] };
const reps = (exerciseId: string, sets: number, count: number): StarterExercise => ({ exerciseId, sets, reps: count });
const hold = (exerciseId: string, sets: number, time: number): StarterExercise => ({ exerciseId, sets, time });

// Written for ProFit. These are templates to edit, not progression prescriptions.
export const STARTER_PLANS: StarterPlan[] = [
  { id: 'full-body', name: 'Beginner full body', description: 'Three training days in a cycle. Train when ready, rest between days as needed, and adjust targets to suit you.', days: [
    { name: 'Full body A', exercises: [reps('Bodyweight_Squat', 2, 10), reps('Dumbbell_Bench_Press', 2, 8), reps('Seated_Cable_Rows', 2, 10), hold('Plank', 2, 20)] },
    { name: 'Full body B', exercises: [reps('Romanian_Deadlift', 2, 8), reps('Dumbbell_Shoulder_Press', 2, 8), reps('Seated_Cable_Rows', 2, 10), reps('ProFit_Bird_Dog', 2, 8)] },
    { name: 'Full body C', exercises: [reps('Bodyweight_Squat', 2, 10), reps('Dumbbell_Bench_Press', 2, 8), reps('Standing_Calf_Raises', 2, 12), hold('Plank', 2, 20)] },
  ] },
  { id: 'push-pull-legs', name: 'Push pull legs', description: 'Three named gym days. Repeat at your own pace and edit the exercises or targets.', days: [
    { name: 'Push', exercises: [reps('Barbell_Bench_Press_-_Medium_Grip', 3, 8), reps('Dumbbell_Shoulder_Press', 3, 8), reps('Pushups', 2, 10)] },
    { name: 'Pull', exercises: [reps('Bent_Over_Barbell_Row', 3, 8), reps('Pullups', 3, 5), hold('Plank', 2, 30)] },
    { name: 'Legs', exercises: [reps('Barbell_Squat', 3, 8), reps('Romanian_Deadlift', 3, 8), reps('Standing_Calf_Raises', 3, 12)] },
  ] },
  { id: 'upper-lower', name: 'Upper lower', description: 'Four gym days in a cycle, with room for rest whenever you need it.', days: [
    { name: 'Upper A', exercises: [reps('Barbell_Bench_Press_-_Medium_Grip', 3, 8), reps('Seated_Cable_Rows', 3, 10), reps('Dumbbell_Shoulder_Press', 2, 8)] },
    { name: 'Lower A', exercises: [reps('Barbell_Squat', 3, 8), reps('Romanian_Deadlift', 2, 10), hold('Plank', 2, 30)] },
    { name: 'Upper B', exercises: [reps('Dumbbell_Bench_Press', 3, 10), reps('Bent_Over_Barbell_Row', 3, 8), reps('Pullups', 2, 5)] },
    { name: 'Lower B', exercises: [reps('Romanian_Deadlift', 3, 8), reps('Bodyweight_Squat', 3, 12), reps('Standing_Calf_Raises', 3, 12)] },
  ] },
  { id: 'home', name: 'Home bodyweight', description: 'Three days using your own body weight. Edit reps and hold times to suit your starting point.', days: [
    { name: 'Home A', exercises: [reps('Bodyweight_Squat', 2, 10), reps('Pushups', 2, 6), hold('Plank', 2, 20)] },
    { name: 'Home B', exercises: [reps('ProFit_Bird_Dog', 2, 8), hold('ProFit_Wall_Sit', 2, 20), reps('Pushups', 2, 6)] },
    { name: 'Home C', exercises: [reps('Bodyweight_Squat', 2, 12), reps('ProFit_Bird_Dog', 2, 8), hold('Plank', 2, 20)] },
  ] },
];
export async function copyStarter(db: Database, userId: string, starter: StarterPlan, now: Date): Promise<string> {
  for (const day of starter.days) for (const exercise of day.exercises) if (!builtInExercise(exercise.exerciseId)) throw new Error('Starter exercise is missing from the library.');
  return db.transaction(async (tx) => {
    // Store functions use the transaction already held here, never the outer database queue.
    const scoped: Database = { ...tx, transaction: (action) => action(tx) };
    const planId = await savePlan(scoped, userId, { name: starter.name, shape: 'cycle', difficulty: 'standard', active: true }, now);
    for (const [position, day] of starter.days.entries()) {
      const dayId = await saveDay(scoped, userId, { planId, name: day.name, position, weekday: null, restDay: false }, now);
      for (const [position, exercise] of day.exercises.entries()) await savePlanExercise(scoped, userId, { dayId, exerciseId: exercise.exerciseId, position, sets: exercise.sets, targetReps: exercise.reps ?? null, targetTimeSeconds: exercise.time ?? null, targetDistanceMetres: null, restSeconds: 60, logFields: defaultLogFields(builtInExercise(exercise.exerciseId)!.tracking) }, now);
    }
    return planId;
  });
}
