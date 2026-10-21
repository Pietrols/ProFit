import { expect, it } from 'vitest';
import { sessionItemsView } from '../sessionItemsView';
import { sessionSlotId } from '../structureIdentity';
import type { SessionItem, WorkoutResult } from '../structureTypes';
import { workoutResultsView } from '../workoutResultsView';
import { chooseWorkoutSlot } from '../workoutSelection';
import { at, other, session, sessionId, set } from './fixtures';

const parent = () => ({ ...session(), id: sessionId, updatedAt: at(0).toISOString() });
const original = () => sessionItemsView(parent(), []).items[0]!;
const added = (): SessionItem => ({
  ...original(),
  id: other,
  origin: 'added',
  originalPosition: null,
  replacesItemId: null,
  position: 1,
});
function detail(items: SessionItem[] = [], logs: WorkoutResult[] = []) {
  const itemView = sessionItemsView(parent(), items);
  return { session: parent(), itemView, resultView: workoutResultsView(parent(), itemView, logs) };
}
const slot = (item: SessionItem, setIndex: number) => ({
  itemId: item.id,
  setIndex,
  id: sessionSlotId(item, setIndex),
});

it('honors another exercise without completing or renumbering the original pending work', () => {
  const first = original();
  const second = added();
  const input = detail([second]);
  const before = structuredClone(input);
  expect(chooseWorkoutSlot(input, null)).toEqual({
    current: slot(first, 0),
    following: slot(first, 1),
  });
  expect(chooseWorkoutSlot(input, second.id)).toEqual({
    current: slot(second, 0),
    following: slot(second, 1),
  });
  expect(input).toEqual(before);
});

it('returns to earlier pending work when a selected item is completed, skipped, removed or missing', () => {
  const second = { ...added(), exercise: { ...added().exercise, sets: 1 } };
  const performed = {
    ...set(),
    id: sessionSlotId(second, 0),
    updatedAt: at(1).toISOString(),
    itemId: second.id,
    exercisePosition: null,
    side: 'bilateral' as const,
    targetsAtPerformance: {
      sets: 1,
      targetReps: 8,
      targetTimeSeconds: null,
      targetDistanceMetres: null,
      restSeconds: 60,
    },
  };
  for (const input of [
    detail([second], [performed]),
    detail([{ ...second, state: 'skipped' }]),
    detail([{ ...second, state: 'removed' }]),
    detail(),
  ])
    expect(chooseWorkoutSlot(input, second.id).current).toEqual(slot(original(), 0));
});

it('keeps incomplete saved slots reviewable and wraps the following preview to earlier work', () => {
  const first = { ...original(), exercise: { ...original().exercise, sets: 1 } };
  const second = { ...added(), exercise: { ...added().exercise, sets: 1 } };
  const log = {
    ...set(),
    id: sessionSlotId(first, 0),
    updatedAt: at(1).toISOString(),
    itemId: first.id,
    side: 'bilateral' as const,
    targetsAtPerformance: {
      sets: 1,
      targetReps: 8,
      targetTimeSeconds: null,
      targetDistanceMetres: null,
      restSeconds: 60,
    },
    logFields: ['reps', 'done'] as const,
    values: { reps: 8, done: false },
  };
  const input = detail([first, second], [{ ...log, logFields: [...log.logFields] }]);
  expect(chooseWorkoutSlot(input, first.id).current).toEqual(slot(first, 0));
  expect(chooseWorkoutSlot(input, second.id)).toEqual({
    current: slot(second, 0),
    following: slot(first, 0),
  });
});

it('selects nothing for unavailable data, ended sessions or an entirely skipped workout', () => {
  const input = detail();
  for (const value of [
    { ...input, itemView: { ...input.itemView, available: false } },
    { ...input, resultView: { ...input.resultView, available: false } },
    { ...input, session: { ...input.session, status: 'completed' as const } },
    detail([{ ...original(), state: 'skipped' }]),
  ])
    expect(chooseWorkoutSlot(value, null)).toEqual({ current: null, following: null });
});
