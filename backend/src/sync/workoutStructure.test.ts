import { expect, it } from 'vitest';
import { sessionItemRecord, workoutSetRecord } from './workoutStructure.js';
import { setLogRecord } from './workoutSchemas.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const metadata = { updatedAt: '2026-10-21T09:02:00Z', deletedAt: null };
const targets = {
  sets: 3,
  targetReps: 8,
  targetTimeSeconds: null,
  targetDistanceMetres: null,
  restSeconds: 60,
};
const item = () => ({
  ...metadata,
  id: 'dc0535d2-4069-50fb-b8f0-d924b2a39d06',
  sessionId: id(3),
  origin: 'planned',
  originalPosition: 0,
  replacesItemId: null,
  position: 0,
  state: 'active',
  reason: null,
  exercise: {
    ...targets,
    exerciseId: 'Barbell_Bench_Press',
    name: 'Bench press',
    logFields: ['weight', 'reps'],
  },
});
const legacy = () => ({
  ...metadata,
  id: '2695500a-9765-5a52-a944-64b67710ea07',
  sessionId: id(3),
  exercisePosition: 0,
  setIndex: 0,
  loggedAt: '2026-10-21T09:01:00Z',
  logFields: ['weight', 'reps'],
  values: { weight: 0, reps: 8 },
});
const stable = () => ({
  ...legacy(),
  itemId: item().id,
  side: 'bilateral',
  targetsAtPerformance: targets,
});

it('accepts planned, added and replacement item shapes while rejecting ambiguous origins', () => {
  expect(sessionItemRecord.parse(item())).toEqual(item());
  expect(
    sessionItemRecord.safeParse({ ...item(), id: id(4), origin: 'added', originalPosition: null })
      .success,
  ).toBe(true);
  expect(
    sessionItemRecord.safeParse({
      ...item(),
      id: id(4),
      origin: 'replacement',
      originalPosition: null,
      replacesItemId: item().id,
    }).success,
  ).toBe(true);
  for (const patch of [
    { originalPosition: null },
    { origin: 'added' },
    { origin: 'replacement', originalPosition: null, replacesItemId: null },
    { origin: 'replacement', originalPosition: null, replacesItemId: item().id },
    { position: -1 },
    { reason: 'x'.repeat(501) },
  ]) {
    expect(sessionItemRecord.safeParse({ ...item(), ...patch }).success).toBe(false);
  }
});

it('preserves legacy values, ids, time and tombstones with no fabricated performance targets', () => {
  for (const record of [legacy(), { ...legacy(), deletedAt: metadata.updatedAt }]) {
    expect(workoutSetRecord.parse(record)).toEqual(setLogRecord.parse(record));
    expect(
      workoutSetRecord.parse({ ...record, itemId: null, side: null, targetsAtPerformance: null }),
    ).toEqual({
      ...record,
      itemId: null,
      side: null,
      targetsAtPerformance: null,
    });
  }
});

it('accepts stable planned and added slots with explicit performance targets', () => {
  expect(workoutSetRecord.parse(stable())).toEqual(stable());
  const added = {
    ...stable(),
    id: 'a3b5b5e6-aca0-5707-b8c2-3186eba06b4b',
    itemId: id(4),
    exercisePosition: null,
  };
  expect(workoutSetRecord.parse(added)).toEqual(added);
  expect(setLogRecord.safeParse(added).success).toBe(false);
});

it('rejects partial metadata, unchosen values and slots outside the captured target', () => {
  for (const patch of [
    { itemId: null },
    { side: null },
    { targetsAtPerformance: null },
    { side: 'left' },
    { setIndex: 3 },
    { exercisePosition: -1 },
    { values: {} },
    { values: { time: 60 } },
    { values: { weight: -1 } },
    { targetsAtPerformance: { ...targets, targetReps: 0 } },
    { targetsAtPerformance: { ...targets, guessedLoadKg: 80 } },
  ]) {
    expect(workoutSetRecord.safeParse({ ...stable(), ...patch }).success).toBe(false);
  }
  expect(workoutSetRecord.safeParse({ ...legacy(), itemId: item().id }).success).toBe(false);
});
