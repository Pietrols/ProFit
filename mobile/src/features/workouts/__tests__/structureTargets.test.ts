import { expect, it } from 'vitest';
import { capturePerformanceTargets } from '../structureTargets';
import { snapshot } from './fixtures';

it('captures the effective targets at performance and keeps them after later item edits', () => {
  const exercise = snapshot().exercises[0]!;
  const captured = capturePerformanceTargets(exercise, 'hard', false);
  expect(captured).toEqual({
    sets: 3,
    targetReps: 10,
    targetTimeSeconds: null,
    targetDistanceMetres: null,
    restSeconds: 60,
  });
  exercise.sets = 1;
  exercise.targetReps = 5;
  exercise.restSeconds = 20;
  expect(captured.sets).toBe(3);
  expect(captured.targetReps).toBe(10);
  expect(captured.restSeconds).toBe(60);
  expect(capturePerformanceTargets(exercise, 'hard', true)).toMatchObject({ targetReps: 4 });
});

it('preserves null targets and the existing scaling caps without adding a weight guess', () => {
  const exercise = {
    ...snapshot().exercises[0]!,
    targetReps: null,
    targetTimeSeconds: 86400,
    targetDistanceMetres: 1000000,
    restSeconds: 0,
  };
  expect(capturePerformanceTargets(exercise, 'hard', false)).toEqual({
    sets: 3,
    targetReps: null,
    targetTimeSeconds: 86400,
    targetDistanceMetres: 1000000,
    restSeconds: 0,
  });
  expect(() => capturePerformanceTargets({ ...exercise, sets: 0 }, 'standard', false)).toThrow();
});
