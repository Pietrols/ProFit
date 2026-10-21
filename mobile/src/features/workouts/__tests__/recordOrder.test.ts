import { expect, it } from 'vitest';
import { latestRecords, resolveRecordRevisions } from '../recordOrder';

const first = { id: 'set', updatedAt: '2026-10-21T08:00:00.000Z', deletedAt: null, value: 60 };

it('compares instants across offsets and gives tombstones precedence at the same instant', () => {
  const equivalent = { ...first, updatedAt: '2026-10-21T10:00:00.000+02:00', value: 80 };
  const removed = { ...first, deletedAt: first.updatedAt };
  for (const records of [
    [first, equivalent, removed],
    [removed, equivalent, first],
  ])
    expect(latestRecords(records)).toEqual([removed]);
  expect(latestRecords([equivalent, first])).toEqual(latestRecords([first, equivalent]));
});

it('keeps a newer payload before eligibility checks and never resurrects an older variant', () => {
  const newer = { ...first, updatedAt: '2026-10-21T08:00:00.001Z', value: -1 };
  const invalidTime = { ...first, updatedAt: 'invalid', value: 999 };
  const other = { ...first, id: 'other' };
  const records = Object.freeze([Object.freeze(first), Object.freeze(newer), invalidTime, other]);
  expect(latestRecords(records)).toEqual([newer, other]);
  expect(latestRecords([...records].reverse()).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
    other,
    newer,
  ]);
  expect(records[0]).toBe(first);
  expect(first.value).toBe(60);
  expect(resolveRecordRevisions(records).unavailableIds).toEqual(['set']);
});
