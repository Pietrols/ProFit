import { expect, it } from 'vitest';
import {
  prepareStablePerformance,
  sessionItemRevision,
  type StablePerformanceInput,
} from '../stablePerformance';
import { sessionItemsView } from '../sessionItemsView';
import { sessionSlotId } from '../structureIdentity';
import type { SessionItem } from '../structureTypes';
import { at, other, session, sessionId, set } from './fixtures';

const parent = () => ({ ...session(), id: sessionId, updatedAt: at(0).toISOString() });
const item = () => sessionItemsView(parent(), []).items[0]!;
const request = (): StablePerformanceInput => ({
  item: item(),
  setIndex: 0,
  values: { weight: 0, reps: 8 },
  difficulty: 'standard',
  easierToday: false,
});

it('captures independent effective targets and chosen values without guessing a load or changing the routine', () => {
  const current = { ...parent(), easierToday: true };
  const input = { ...request(), easierToday: true };
  const before = structuredClone({ current, input });
  const result = prepareStablePerformance(current, item(), input, null, at(1));
  expect(result).toMatchObject({
    id: sessionSlotId(item(), 0),
    itemId: item().id,
    exercisePosition: 0,
    side: 'bilateral',
    values: { weight: 0, reps: 8 },
    targetsAtPerformance: { sets: 3, targetReps: 6, restSeconds: 60 },
  });
  result.values.weight = 50;
  result.logFields.pop();
  result.targetsAtPerformance.sets = 1;
  expect({ current, input }).toEqual(before);
});

it('uses the added namespace and rejects changed item revisions or difficulty settings', () => {
  const added: SessionItem = {
    ...item(),
    id: other,
    origin: 'added',
    originalPosition: null,
    replacesItemId: null,
  };
  const input = { ...request(), item: added };
  expect(prepareStablePerformance(parent(), added, input, null, at(1))).toMatchObject({
    id: sessionSlotId(added, 0),
    exercisePosition: null,
  });
  for (const patch of [
    { position: 10 },
    { reason: 'Changed' },
    { exercise: { ...added.exercise, targetReps: 10 } },
  ])
    expect(() =>
      prepareStablePerformance(parent(), { ...added, ...patch }, input, null, at(1)),
    ).toThrow('changed');
  expect(() =>
    prepareStablePerformance({ ...parent(), easierToday: true }, added, input, null, at(1)),
  ).toThrow('changed');
  expect(() =>
    prepareStablePerformance(parent(), added, { ...input, difficulty: 'hard' }, null, at(1)),
  ).toThrow('changed');
  expect(sessionItemRevision({ ...added, exercise: { ...added.exercise } })).toBe(
    sessionItemRevision(added),
  );
});

it('refuses unavailable, inactive, invalid or out-of-time performances', () => {
  for (const state of ['skipped', 'removed'] as const) {
    const changed = { ...item(), state };
    expect(() =>
      prepareStablePerformance(parent(), changed, { ...request(), item: changed }, null, at(1)),
    ).toThrow('available');
  }
  for (const setIndex of [-1, 3, 100])
    expect(() =>
      prepareStablePerformance(parent(), item(), { ...request(), setIndex }, null, at(1)),
    ).toThrow();
  expect(() => prepareStablePerformance(parent(), item(), request(), null, at(-1))).toThrow(
    'session times',
  );
  expect(() => prepareStablePerformance(parent(), item(), request(), null, new Date(NaN))).toThrow(
    'phone date',
  );
  expect(() =>
    prepareStablePerformance(
      { ...parent(), status: 'completed', endedAt: at(5).toISOString() },
      item(),
      request(),
      null,
      at(1),
    ),
  ).toThrow('active workout');
  expect(() =>
    prepareStablePerformance(parent(), item(), { ...request(), values: { time: 20 } }, null, at(1)),
  ).toThrow();
});

it('keeps live results in the correction flow and only reuses a deleted slot through a new performance', () => {
  const original = prepareStablePerformance(parent(), item(), request(), null, at(1));
  expect(() => prepareStablePerformance(parent(), item(), request(), original, at(2))).toThrow(
    'already has a result',
  );
  const incomplete = {
    ...original,
    logFields: [...original.logFields, 'done' as const],
    values: { ...original.values, done: false },
  };
  expect(() => prepareStablePerformance(parent(), item(), request(), incomplete, at(2))).toThrow(
    'already has a result',
  );
  const deleted = { ...original, updatedAt: at(5).toISOString(), deletedAt: at(5).toISOString() };
  const fresh = prepareStablePerformance(parent(), item(), request(), deleted, at(3));
  expect(fresh.id).toBe(original.id);
  expect(fresh.loggedAt).toBe(at(3).toISOString());
  expect(Date.parse(fresh.updatedAt)).toBe(at(5).getTime() + 1);
  const legacy = {
    ...set(),
    id: sessionSlotId(item(), 0),
    updatedAt: at(2).toISOString(),
    deletedAt: at(2).toISOString(),
  };
  expect(prepareStablePerformance(parent(), item(), request(), legacy, at(3)).itemId).toBe(
    item().id,
  );
});
