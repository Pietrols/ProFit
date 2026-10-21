import { expect, it } from 'vitest';
import { completedSets } from '../logic';
import { setLogId } from '../identity';
import { sessionItemsView } from '../sessionItemsView';
import { sessionSlotId } from '../structureIdentity';
import type { SessionItem, StableSetLog } from '../structureTypes';
import { workoutResultsView } from '../workoutResultsView';
import { at, other, session, sessionId, set } from './fixtures';

const parent = () => ({ ...session(), id: sessionId, updatedAt: at(0).toISOString() });
const planned = () => sessionItemsView(parent(), []).items[0]!;
const legacy = () => ({ ...set(), id: setLogId(sessionId, 0, 0), updatedAt: at(1).toISOString() });
const stable = (item = planned()): StableSetLog => ({
  ...legacy(),
  id: sessionSlotId(item, 0),
  itemId: item.id,
  exercisePosition: item.originalPosition,
  side: 'bilateral',
  targetsAtPerformance: {
    sets: 3,
    targetReps: 8,
    targetTimeSeconds: null,
    targetDistanceMetres: null,
    restSeconds: 60,
  },
});

it('matches the legacy oracle and keeps historical targets unknown after current item edits', () => {
  const removed: SessionItem = {
    ...planned(),
    state: 'removed' as const,
    exercise: { ...planned().exercise, sets: 1, logFields: ['notes'] },
  };
  const view = sessionItemsView(parent(), [removed]);
  const logs = [
    legacy(),
    { ...legacy(), updatedAt: at(2).toISOString(), values: { reps: 8, weight: 0 } },
  ];
  const result = workoutResultsView(parent(), view, logs);
  expect(result.available).toBe(true);
  expect(result.results.map((row) => row.log)).toEqual(completedSets(parent(), logs));
  expect(result.results[0]!.targetsAtPerformance).toBeNull();
});

it('keeps performed stable work on reduced, skipped, removed and tombstoned items', () => {
  const log = stable();
  for (const state of ['active', 'skipped', 'removed'] as const) {
    const changed = {
      ...planned(),
      state,
      deletedAt: at(2).toISOString(),
      exercise: { ...planned().exercise, sets: 1 },
    };
    const performed = { ...log, id: sessionSlotId(planned(), 2), setIndex: 2 };
    const result = workoutResultsView(parent(), sessionItemsView(parent(), [changed]), [performed]);
    expect(result.available).toBe(true);
    expect(result.results[0]!.targetsAtPerformance!.sets).toBe(3);
    result.results[0]!.log.values.weight = 999;
    expect(performed.values.weight).toBe(45);
  }
});

it('waits for added parents and preserves their null original position without inventing ids', () => {
  const added: SessionItem = {
    ...planned(),
    id: other,
    origin: 'added',
    originalPosition: null,
    replacesItemId: null,
  };
  const log = stable(added);
  const missing = workoutResultsView(parent(), sessionItemsView(parent(), []), [log]);
  expect(missing.results).toEqual([]);
  expect(missing.unavailableResultIds).toEqual([log.id]);
  const arrived = workoutResultsView(parent(), sessionItemsView(parent(), [added]), [log]);
  expect(arrived.available).toBe(true);
  expect(arrived.results[0]!.log).toEqual(log);
});

it('resolves legacy and stable revisions together before deletion or eligibility filters', () => {
  const view = sessionItemsView(parent(), []);
  const newer = { ...stable(), updatedAt: at(2).toISOString() };
  const invalid = { ...newer, itemId: other };
  expect(workoutResultsView(parent(), view, [legacy(), invalid]).results).toEqual([]);
  const deleted = { ...newer, deletedAt: at(2).toISOString() };
  expect(workoutResultsView(parent(), view, [legacy(), deleted]).results).toEqual([]);
  const incomplete = {
    ...newer,
    logFields: [...newer.logFields, 'done' as const],
    values: { ...newer.values, done: false },
  };
  const hidden = workoutResultsView(parent(), view, [legacy(), incomplete]);
  expect(hidden.results).toEqual([]);
  expect(hidden.loggedResults.map((row) => row.log)).toEqual([incomplete]);
  hidden.loggedResults[0]!.log.values.weight = 999;
  expect(incomplete.values.weight).toBe(45);
  expect(hidden.available).toBe(true);
  expect(workoutResultsView(parent(), view, [newer, legacy()]).results[0]!.log).toEqual(newer);
});

it('reports invalid time, identity, partial metadata and unreadable data without leaking foreign results', () => {
  const view = sessionItemsView(parent(), []);
  for (const log of [
    { ...legacy(), updatedAt: 'invalid' },
    { ...legacy(), exercisePosition: -1 },
    { ...legacy(), side: 'bilateral' },
    { ...stable(), loggedAt: at(-1).toISOString() },
  ]) {
    const result = workoutResultsView(parent(), view, [log]);
    expect(result.available).toBe(false);
    expect(result.loggedResults).toEqual([]);
    expect(result.unavailableResultIds).toEqual([log.id]);
  }
  expect(workoutResultsView(parent(), view, [{ ...legacy(), sessionId: other }]).results).toEqual(
    [],
  );
  expect(workoutResultsView(parent(), view, [legacy()], [legacy().id]).results).toEqual([]);
  expect(
    workoutResultsView({ ...parent(), deletedAt: at(3).toISOString() }, view, [legacy()]).available,
  ).toBe(false);
});
