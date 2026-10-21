import { expect, it } from 'vitest';
import { prefillHistoryRequests } from '../historyRequests';
import { session, sessionId } from './fixtures';

it('requests only historical fields that targets cannot supply and deduplicates repeated exercises', () => {
  const current = { ...session(), id: sessionId, updatedAt: session().startedAt };
  expect(prefillHistoryRequests(current)).toEqual([
    { exerciseId: 'Barbell_Bench_Press', field: 'weight' },
  ]);
  const exercise = current.snapshot.exercises[0]!;
  exercise.targetReps = null;
  exercise.logFields = ['reps', 'weight', 'time', 'distance', 'rest', 'RPE', 'notes', 'done'];
  current.snapshot.exercises.push({ ...exercise });
  expect(prefillHistoryRequests(current)).toEqual([
    { exerciseId: exercise.exerciseId, field: 'weight' },
    { exerciseId: exercise.exerciseId, field: 'reps' },
    { exerciseId: exercise.exerciseId, field: 'time' },
    { exerciseId: exercise.exerciseId, field: 'distance' },
  ]);
  current.snapshot.exercises.forEach((e) => {
    e.targetTimeSeconds = 30;
    e.targetDistanceMetres = 10;
  });
  expect(prefillHistoryRequests(current).map((r) => r.field)).toEqual(['weight', 'reps']);
});
