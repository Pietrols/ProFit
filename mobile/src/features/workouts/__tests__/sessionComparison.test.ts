import { describe, expect, it } from 'vitest';
import { compareSession } from '../sessionComparison';
import { sessionItemsView } from '../sessionItemsView';
import { sessionSlotId } from '../structureIdentity';
import { capturePerformanceTargets } from '../structureTargets';
import type { SessionItem, StableSetLog, WorkoutResult } from '../structureTypes';
import { workoutResultsView } from '../workoutResultsView';
import { at, other, session, sessionId, set } from './fixtures';

const parent = () => ({ ...session(), id: sessionId, updatedAt: at(0).toISOString() });
const planned = () => sessionItemsView(parent(), []).items[0]!;
const performance = (item = planned(), index = 0): StableSetLog => ({
  ...set(),
  id: sessionSlotId(item, index),
  updatedAt: at(1).toISOString(),
  exercisePosition: item.originalPosition,
  itemId: item.id,
  setIndex: index,
  side: 'bilateral',
  targetsAtPerformance: capturePerformanceTargets(item.exercise, 'standard', false),
});
function compare(items: SessionItem[], logs: WorkoutResult[], easierToday = false) {
  const current = { ...parent(), easierToday };
  const itemView = sessionItemsView(current, items);
  return compareSession(current, itemView, workoutResultsView(current, itemView, logs));
}

describe('original, adjusted and performed workout comparison', () => {
  it('keeps performance targets frozen when later adjustments change future targets', () => {
    const first = performance();
    const changed = { ...planned(), exercise: { ...planned().exercise, targetReps: 12 } };
    const second = { ...performance(changed, 1), values: { reps: 0, weight: 0 } };
    const before = structuredClone({ first, changed, second });
    const row = compare([changed], [first, second], true).rows[0]!;
    expect(row.originalTargets?.targetReps).toBe(8);
    expect(row.adjustedTargets?.targetReps).toBe(10);
    expect(row.sets[0]!.metrics[0]).toEqual({ field: 'reps', actual: 8, target: 8, difference: 0 });
    expect(row.sets[1]!.metrics[0]).toEqual({
      field: 'reps',
      actual: 0,
      target: 12,
      difference: -12,
    });
    expect(row).toMatchObject({ completed: 2, missing: 1, originalCompleted: 2 });
    expect({ first, changed, second }).toEqual(before);
  });

  it('keeps absent legacy targets and absent actual values unknown', () => {
    const legacy = {
      ...set(),
      id: sessionSlotId(planned(), 0),
      updatedAt: at(1).toISOString(),
      values: { weight: 0 },
    };
    const row = compare([], [legacy]).rows[0]!;
    expect(row.sets[0]!.metrics[0]).toEqual({
      field: 'reps',
      actual: null,
      target: null,
      difference: null,
    });
    expect(row.sets[0]!.result.log.values.weight).toBe(0);
    expect(row.sets[0]!.result.targetsAtPerformance).toBeNull();
  });

  it('retains removed results and never credits replacements against the original routine', () => {
    const original = { ...planned(), state: 'removed' as const, reason: 'Bench taken' };
    const replacement: SessionItem = {
      ...planned(),
      id: other,
      origin: 'replacement',
      originalPosition: null,
      replacesItemId: original.id,
      position: 1,
      exercise: { ...planned().exercise, name: 'Rows', exerciseId: 'Rows' },
    };
    const result = compare([original, replacement], [performance(), performance(replacement)]);
    expect(result.rows[0]).toMatchObject({
      originalCompleted: 1,
      originalOmitted: 2,
      completed: 1,
      currentTargetSets: 0,
    });
    expect(result.rows[1]).toMatchObject({
      original: null,
      originalCompleted: 0,
      completed: 1,
      missing: 2,
    });
    expect(result.rows[1]!.item?.replacesItemId).toBe(original.id);
  });

  it('distinguishes skipped, added, incomplete and deleted work without manufacturing results', () => {
    const skipped = { ...planned(), state: 'skipped' as const };
    const added: SessionItem = {
      ...planned(),
      id: other,
      origin: 'added',
      originalPosition: null,
      replacesItemId: null,
    };
    const incomplete = {
      ...performance(added),
      logFields: ['reps', 'done'] as const,
      values: { reps: 5, done: false },
    };
    const removed = { ...performance(added, 1), deletedAt: at(2).toISOString() };
    const result = compare(
      [skipped, added],
      [{ ...incomplete, logFields: [...incomplete.logFields] }, removed],
    );
    expect(result.rows[0]).toMatchObject({ originalOmitted: 3, completed: 0, missing: 0 });
    expect(result.rows[1]).toMatchObject({ completed: 0, missing: 3 });
    expect(result.rows[1]!.sets).toHaveLength(1);
    expect(result.rows[1]!.sets[0]!.complete).toBe(false);
  });

  it('flags unavailable data while keeping its original routine visible', () => {
    const current = parent();
    const itemView = sessionItemsView(current, [], [planned().id]);
    const result = compareSession(current, itemView, workoutResultsView(current, itemView, []));
    expect(result.available).toBe(false);
    expect(result.rows[0]).toMatchObject({ item: null, originalCompleted: 0, originalOmitted: 0 });
    expect(result.rows[0]!.original?.name).toBe('Bench press');
  });
});
