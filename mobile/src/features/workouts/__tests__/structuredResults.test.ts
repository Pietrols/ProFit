import { expect, it } from 'vitest';
import { setLogId } from '../identity';
import { sessionResultsFromSets } from '../logic';
import { sessionItemsView } from '../sessionItemsView';
import { sessionSlotId } from '../structureIdentity';
import { capturePerformanceTargets } from '../structureTargets';
import type { SessionItem, StableSetLog, WorkoutResult } from '../structureTypes';
import { structuredWorkoutResults } from '../structuredResults';
import { workoutResultsView } from '../workoutResultsView';
import { at, other, session, sessionId, set } from './fixtures';

const parent = () => ({ ...session(), id: sessionId, updatedAt: at(0).toISOString() });
const planned = () => sessionItemsView(parent(), []).items[0]!;
const legacy = () => ({ ...set(), id: setLogId(sessionId, 0, 0), updatedAt: at(1).toISOString() });
const stable = (item: SessionItem, index = 0): StableSetLog => ({
  ...legacy(),
  id: sessionSlotId(item, index),
  itemId: item.id,
  setIndex: index,
  exercisePosition: item.originalPosition,
  side: 'bilateral',
  targetsAtPerformance: capturePerformanceTargets(planned().exercise, 'standard', false),
});
function input(items: SessionItem[], logs: WorkoutResult[]) {
  const itemView = sessionItemsView(parent(), items);
  return {
    session: parent(),
    itemView,
    resultView: workoutResultsView(parent(), itemView, logs),
    previousSets: [],
  };
}

it('matches legacy counts, volume and records while returning stable next-slot identities', () => {
  const log = legacy();
  const expected = sessionResultsFromSets(parent(), [log], []);
  const result = structuredWorkoutResults(input([], [log]));
  expect(result).toMatchObject({
    total: expected.total,
    completed: expected.completed,
    volumeKg: expected.volumeKg,
    records: expected.records,
    actualCompleted: 1,
    outsideTargetCompleted: 0,
  });
  expect(result.next).toEqual({ itemId: planned().id, setIndex: 1, id: setLogId(sessionId, 0, 1) });
});

it('counts current slots separately from removed or extra actuals without losing their volume', () => {
  const original = planned();
  const removed = {
    ...original,
    state: 'removed' as const,
    deletedAt: at(2).toISOString(),
    exercise: { ...original.exercise, sets: 1 },
  };
  const added: SessionItem = {
    ...original,
    id: other,
    origin: 'added',
    originalPosition: null,
    replacesItemId: null,
    position: 0,
    exercise: { ...original.exercise, exerciseId: 'Added_row', sets: 2 },
  };
  const detail = input([removed, added], [stable(original, 2), stable(added)]);
  const before = structuredClone(detail);
  const result = structuredWorkoutResults(detail);
  expect(result).toMatchObject({
    total: 2,
    completed: 1,
    actualCompleted: 2,
    outsideTargetCompleted: 1,
    volumeKg: 720,
    available: true,
  });
  expect(result.next).toEqual({ itemId: added.id, setIndex: 1, id: sessionSlotId(added, 1) });
  expect(detail).toEqual(before);
});

it('skips inactive work and restores the same slot instead of changing original identities', () => {
  for (const state of ['skipped', 'removed'] as const) {
    const result = structuredWorkoutResults(input([{ ...planned(), state }], []));
    expect(result.total).toBe(0);
    expect(result.next).toBeNull();
  }
  expect(structuredWorkoutResults(input([planned()], [])).next!.id).toBe(setLogId(sessionId, 0, 0));
});

it('blocks next work and record celebrations for incomplete data and never selects work in an ended session', () => {
  const orphan: SessionItem = {
    ...planned(),
    id: other,
    origin: 'added',
    originalPosition: null,
    replacesItemId: null,
  };
  const detail = input([], [legacy(), stable(orphan)]);
  const incomplete = structuredWorkoutResults(detail);
  expect(incomplete.available).toBe(false);
  expect(incomplete.next).toBeNull();
  expect(incomplete.records).toEqual([]);
  expect(incomplete.actualCompleted).toBe(1);
  expect(incomplete.volumeKg).toBe(360);
  const valid = input([], [legacy()]);
  expect(
    structuredWorkoutResults({
      ...valid,
      session: { ...valid.session, status: 'completed', endedAt: at(5).toISOString() },
    }).next,
  ).toBeNull();
});
