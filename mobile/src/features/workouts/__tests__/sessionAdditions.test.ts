import { expect, it } from 'vitest';
import { addSessionItems } from '../sessionAdditions';
import { sessionItemsView } from '../sessionItemsView';
import { sessionSlotId } from '../structureIdentity';
import { workoutResultsView } from '../workoutResultsView';
import { at, other, session, sessionId, set } from './fixtures';

function fixture() {
  const parent = { ...session(), id: sessionId, updatedAt: at(0).toISOString() };
  const itemView = sessionItemsView(parent, []);
  const item = itemView.items[0]!;
  const log = { ...set(), id: sessionSlotId(item, 0), updatedAt: at(1).toISOString() };
  return { session: parent, itemView, resultView: workoutResultsView(parent, itemView, [log]) };
}

it('adds independent occurrences without transferring results or changing the original routine', () => {
  const detail = fixture();
  const original = detail.itemView.items[0]!;
  const before = structuredClone(detail);
  const exercise = { ...original.exercise, exerciseId: 'New_row', name: 'Row' };
  const writes = addSessionItems(detail, other, exercise, at(2));
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    id: other,
    origin: 'added',
    position: 1,
    originalPosition: null,
    replacesItemId: null,
  });
  expect(sessionSlotId(writes[0]!, 0)).not.toBe(sessionSlotId(original, 0));
  writes[0]!.exercise.logFields.push('done');
  expect(exercise.logFields).not.toContain('done');
  expect(detail).toEqual(before);
});

it('replaces remaining work with a linked occurrence while preserving the source identity and actuals', () => {
  const detail = fixture();
  const original = detail.itemView.items[0]!;
  const exercise = { ...original.exercise, exerciseId: 'New_row', name: 'Row' };
  const writes = addSessionItems(detail, other, exercise, at(2), original);
  expect(writes).toHaveLength(2);
  expect(writes[0]).toMatchObject({
    id: original.id,
    state: 'removed',
    exercise: original.exercise,
  });
  expect(writes[1]).toMatchObject({
    id: other,
    origin: 'replacement',
    replacesItemId: original.id,
  });
  const view = sessionItemsView(detail.session, writes);
  expect(view.available).toBe(true);
  expect(
    workoutResultsView(
      detail.session,
      view,
      detail.resultView.results.map((row) => row.log),
    ).results,
  ).toEqual(detail.resultView.results);
});

it('rejects identity reuse, malformed exercise snapshots, stale sources and replacement of omitted work', () => {
  const detail = fixture();
  const original = detail.itemView.items[0]!;
  expect(() => addSessionItems(detail, original.id, original.exercise, at(2))).toThrow(
    'new session',
  );
  expect(() => addSessionItems(detail, other, { ...original.exercise, name: '' }, at(2))).toThrow();
  expect(() =>
    addSessionItems(detail, other, original.exercise, at(2), { ...original, position: 9 }),
  ).toThrow('changed');
  const removed = { ...original, state: 'removed' as const };
  const itemView = sessionItemsView(detail.session, [removed]);
  expect(() =>
    addSessionItems({ ...detail, itemView }, other, original.exercise, at(2), removed),
  ).toThrow('remaining work');
});
