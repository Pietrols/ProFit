import { expect, it } from 'vitest';
import { builtInExercise } from '../../exercises/library';
import { targetForm } from '../../plans/exerciseForm';
import { exerciseForWorkout, parseSessionExercise } from '../sessionExerciseForm';

it('starts an added or replacement exercise from its own library tracking fields', () => {
  const exercise = exerciseForWorkout(builtInExercise('Plank')!);
  expect(exercise).toMatchObject({
    exerciseId: 'Plank',
    sets: 3,
    targetReps: null,
    targetTimeSeconds: null,
    restSeconds: 60,
    logFields: ['time'],
  });
  expect(exercise).not.toHaveProperty('values');
  expect(parseSessionExercise(targetForm(exercise), exercise.logFields, exercise)).toEqual(
    exercise,
  );
});

it('parses zero rest, optional targets and chosen fields without mutating the snapshot', () => {
  const exercise = exerciseForWorkout(builtInExercise('Plank')!);
  const updated = parseSessionExercise(
    { ...targetForm(exercise), time: '30', rest: '0' },
    ['time', 'done'],
    exercise,
  );
  expect(updated).toMatchObject({
    targetTimeSeconds: 30,
    restSeconds: 0,
    logFields: ['time', 'done'],
  });
  expect(exercise.targetTimeSeconds).toBeNull();
  expect(exercise.restSeconds).toBe(60);
});

it('rejects malformed targets, fractional set counts and an empty field selection', () => {
  const exercise = exerciseForWorkout(builtInExercise('Plank')!);
  for (const patch of [{ sets: '1.5' }, { rest: '-1' }, { time: '1e2' }, { sets: '101' }])
    expect(() =>
      parseSessionExercise({ ...targetForm(exercise), ...patch }, exercise.logFields, exercise),
    ).toThrow();
  expect(() => parseSessionExercise(targetForm(exercise), [], exercise)).toThrow();
});
