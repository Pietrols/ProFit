import { expect, it } from 'vitest';
import { setLogId } from '../identity';
import {
  correctSet,
  removeSet,
  setRevision,
  SetConflictError,
  undoSet,
  type SetRecord,
} from '../setChanges';
import { at, sessionId, set } from './fixtures';
import { plannedItemId } from '../structureIdentity';

const record = (): SetRecord => ({
  ...set(),
  id: setLogId(sessionId, 0, 0),
  values: { reps: 8, weight: 80 },
  updatedAt: at(2).toISOString(),
  deletedAt: null,
});

it('corrects 80 to 60 without changing identity, slot, chosen fields or performance time', () => {
  const original = record();
  const before = JSON.stringify(original);
  const result = correctSet(original, { reps: 8, weight: 60 }, setRevision(original), at(3));
  expect(result).toEqual({
    ...original,
    values: { reps: 8, weight: 60 },
    updatedAt: at(3).toISOString(),
  });
  result.logFields.pop();
  result.values.weight = 1;
  expect(JSON.stringify(original)).toBe(before);
});

it('distinguishes zero from missing load and validates the chosen fields', () => {
  const original = record();
  const revision = setRevision(original);
  expect(correctSet(original, { reps: 0, weight: 0 }, revision, at(3)).values).toEqual({
    reps: 0,
    weight: 0,
  });
  expect(correctSet(original, { reps: 8 }, revision, at(3)).values).toEqual({ reps: 8 });
  expect(() => correctSet(original, { time: 30 }, revision, at(3))).toThrow();
  expect(() => correctSet(original, {}, revision, at(3))).toThrow();
  expect(() => correctSet(original, { weight: -1 }, revision, at(3))).toThrow();
});

it('rejects a stale result even if another edit used the same timestamp', () => {
  const original = record();
  const changed = { ...original, values: { reps: 8, weight: 85 } };
  expect(() => correctSet(changed, { reps: 8, weight: 60 }, setRevision(original), at(3))).toThrow(
    SetConflictError,
  );
  expect(() => removeSet(changed, setRevision(original), at(3))).toThrow(SetConflictError);
  expect(
    correctSet(changed, { reps: 8, weight: 60 }, setRevision(changed), at(3)).values.weight,
  ).toBe(60);
});

it('keeps the edit clock monotonic and rejects invalid dates without touching performed time', () => {
  const original = record();
  for (const now of [at(0), at(2)]) {
    const next = correctSet(original, { weight: 60 }, setRevision(original), now);
    expect(Date.parse(next.updatedAt)).toBe(at(2).getTime() + 1);
    expect(next.loggedAt).toBe(original.loggedAt);
  }
  expect(() => correctSet(original, { weight: 60 }, setRevision(original), new Date(NaN))).toThrow(
    'phone date',
  );
});

it('undoes only the matching deletion and preserves the same id and original result', () => {
  const original = record();
  const deleted = removeSet(original, setRevision(original), at(3));
  const receipt = { before: original, deletedRevision: setRevision(deleted) };
  const restored = undoSet(receipt, deleted, at(4));
  expect(restored).toEqual({ ...original, updatedAt: at(4).toISOString() });
  expect(() => correctSet(deleted, { weight: 60 }, setRevision(deleted), at(4))).toThrow(
    SetConflictError,
  );
  const newer = correctSet(deleted, { weight: 90 }, setRevision(deleted), at(4), true);
  expect(() => undoSet(receipt, newer, at(5))).toThrow(SetConflictError);
  const deletedAgain = removeSet(newer, setRevision(newer), at(5));
  expect(() => undoSet(receipt, deletedAgain, at(6))).toThrow(SetConflictError);
});

it('preserves stable performance metadata and includes every target in correction conflict checks', () => {
  const original: SetRecord = {
    ...record(),
    itemId: plannedItemId(sessionId, 0),
    side: 'bilateral',
    targetsAtPerformance: {
      sets: 3,
      targetReps: 8,
      targetTimeSeconds: null,
      targetDistanceMetres: null,
      restSeconds: 60,
    },
  };
  const revision = setRevision(original);
  const corrected = correctSet(original, { weight: 60, reps: 8 }, revision, at(3));
  expect(corrected).toMatchObject({
    itemId: original.itemId,
    side: 'bilateral',
    targetsAtPerformance: original.targetsAtPerformance,
    loggedAt: original.loggedAt,
  });
  for (const field of [
    'sets',
    'targetReps',
    'targetTimeSeconds',
    'targetDistanceMetres',
    'restSeconds',
  ] as const) {
    const changed = {
      ...original,
      targetsAtPerformance: { ...original.targetsAtPerformance, [field]: 1 },
    };
    expect(() => correctSet(changed, { weight: 60 }, revision, at(3))).toThrow(SetConflictError);
  }
  expect(() => removeSet({ ...original, itemId: sessionId }, revision, at(3))).toThrow(
    SetConflictError,
  );
  const removed = removeSet(original, revision, at(3));
  const restored = undoSet(
    { before: original, deletedRevision: setRevision(removed) },
    removed,
    at(4),
  );
  expect(restored).toEqual({ ...original, updatedAt: at(4).toISOString() });
  if ('itemId' in corrected) corrected.targetsAtPerformance.sets = 1;
  expect(original.targetsAtPerformance.sets).toBe(3);
});
