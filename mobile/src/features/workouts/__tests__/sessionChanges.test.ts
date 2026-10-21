import { expect, it } from 'vitest';
import { changeSessionItem } from '../sessionChanges';
import { sessionItemsView } from '../sessionItemsView';
import { sessionSlotId } from '../structureIdentity';
import type { SessionItem, WorkoutResult } from '../structureTypes';
import { workoutResultsView } from '../workoutResultsView';
import { at, other, session, sessionId, set } from './fixtures';

const parent = () => ({ ...session(), id: sessionId, updatedAt: at(0).toISOString() });
const original = () => sessionItemsView(parent(), []).items[0]!;
function detail(items: SessionItem[] = [], logs: WorkoutResult[] = []) {
  const itemView = sessionItemsView(parent(), items);
  return { session: parent(), itemView, resultView: workoutResultsView(parent(), itemView, logs) };
}

it('skips, removes and restores remaining work without changing the original routine or actuals', () => {
  const item = original();
  const log = { ...set(), id: sessionSlotId(item, 0), updatedAt: at(1).toISOString() };
  const input = detail([], [log]);
  const before = structuredClone(input);
  for (const state of ['skipped', 'removed'] as const) {
    const changed = changeSessionItem(
      input,
      item,
      { kind: 'state', state, reason: 'Bench occupied' },
      at(2),
    );
    expect(changed).toMatchObject({
      id: item.id,
      state,
      reason: 'Bench occupied',
      updatedAt: at(2).toISOString(),
    });
    const current = detail([changed], [log]);
    expect(current.resultView.results[0]!.log).toEqual(log);
    const restored = changeSessionItem(
      current,
      changed,
      { kind: 'state', state: 'active', reason: null },
      at(1),
    );
    expect(restored.id).toBe(item.id);
    expect(Date.parse(restored.updatedAt)).toBe(at(2).getTime() + 1);
  }
  expect(input).toEqual(before);
});

it('changes future targets but refuses reduction across saved or incomplete tail slots', () => {
  const item = original();
  const log = { ...set(), id: sessionSlotId(item, 2), setIndex: 2, updatedAt: at(1).toISOString() };
  const targets = { ...item.exercise, sets: 2 };
  for (const values of [log.values, { ...log.values, done: false }]) {
    const saved = {
      ...log,
      itemId: item.id,
      side: 'bilateral' as const,
      targetsAtPerformance: {
        sets: 3,
        targetReps: 8,
        targetTimeSeconds: null,
        targetDistanceMetres: null,
        restSeconds: 60,
      },
      logFields: [...log.logFields, 'done' as const],
      values,
    };
    expect(() =>
      changeSessionItem(detail([], [saved]), item, { kind: 'targets', targets }, at(2)),
    ).toThrow('saved tail');
  }
  const changed = changeSessionItem(detail(), item, { kind: 'targets', targets }, at(2));
  expect(changed.exercise.sets).toBe(2);
  expect(item.exercise.sets).toBe(3);
  for (const sets of [0, 101, NaN])
    expect(() =>
      changeSessionItem(detail(), item, { kind: 'targets', targets: { ...targets, sets } }, at(2)),
    ).toThrow();
});

it('rejects stale, foreign, unavailable, ended and invalid commands without mutating their inputs', () => {
  const item = original();
  const state = { kind: 'state' as const, state: 'skipped' as const, reason: null };
  const input = detail();
  expect(() => changeSessionItem(input, { ...item, position: 9 }, state, at(2))).toThrow('changed');
  expect(() => changeSessionItem(input, { ...item, sessionId: other }, state, at(2))).toThrow(
    'unavailable',
  );
  expect(() =>
    changeSessionItem(
      { ...input, resultView: { ...input.resultView, available: false } },
      item,
      state,
      at(2),
    ),
  ).toThrow('unavailable');
  expect(() =>
    changeSessionItem(
      { ...input, session: { ...input.session, status: 'completed' } },
      item,
      state,
      at(2),
    ),
  ).toThrow('active');
  expect(() =>
    changeSessionItem(input, item, { ...state, reason: 'x'.repeat(501) }, at(2)),
  ).toThrow();
  expect(() => changeSessionItem(input, item, state, new Date(NaN))).toThrow('date');
  const added: SessionItem = {
    ...item,
    id: other,
    origin: 'added',
    originalPosition: null,
    replacesItemId: null,
  };
  const differentMovement = { ...added.exercise, exerciseId: 'Another_exercise' };
  expect(() =>
    changeSessionItem(
      detail([added]),
      added,
      { kind: 'targets', targets: differentMovement },
      at(2),
    ),
  ).toThrow('different movement');
});
