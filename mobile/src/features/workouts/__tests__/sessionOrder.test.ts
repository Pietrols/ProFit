import { expect, it } from 'vitest';
import { moveSessionItem } from '../sessionOrder';
import { sessionItemsView } from '../sessionItemsView';
import { sessionSlotId } from '../structureIdentity';
import type { SessionItem } from '../structureTypes';
import { workoutResultsView } from '../workoutResultsView';
import { at, other, session, sessionId, set } from './fixtures';

function fixture() {
  const parent = { ...session(), id: sessionId, updatedAt: at(0).toISOString() };
  const original = sessionItemsView(parent, []).items[0]!;
  const added: SessionItem = {
    ...original,
    id: other,
    origin: 'added',
    originalPosition: null,
    replacesItemId: null,
    position: 1,
    updatedAt: at(5).toISOString(),
  };
  const itemView = sessionItemsView(parent, [added]);
  const log = { ...set(), id: sessionSlotId(original, 0), updatedAt: at(1).toISOString() };
  return {
    original,
    added,
    detail: { session: parent, itemView, resultView: workoutResultsView(parent, itemView, [log]) },
  };
}

it('defers remaining work behind other exercises while retaining ids, actuals and the routine', () => {
  const { original, detail } = fixture();
  const before = structuredClone(detail);
  const writes = moveSessionItem(detail, original, detail.itemView.items, 'later', at(2));
  const changed = sessionItemsView(detail.session, writes).items;
  expect(changed.map((item) => item.id)).toEqual([other, original.id]);
  expect(writes.every((item) => Date.parse(item.updatedAt) === at(5).getTime() + 1)).toBe(true);
  expect(sessionSlotId(changed[1]!, 0)).toBe(sessionSlotId(original, 0));
  expect(detail).toEqual(before);
});

it('moves up/down at boundaries without unnecessary writes or changing source identity', () => {
  const { original, added, detail } = fixture();
  expect(moveSessionItem(detail, original, detail.itemView.items, 'up', at(6))).toEqual([]);
  expect(moveSessionItem(detail, added, detail.itemView.items, 'down', at(6))).toEqual([]);
  expect(moveSessionItem(detail, added, detail.itemView.items, 'later', at(6))).toEqual([]);
  const down = moveSessionItem(detail, original, detail.itemView.items, 'down', at(6));
  const up = moveSessionItem(detail, added, detail.itemView.items, 'up', at(6));
  expect(down).toEqual(up);
});

it('rejects a stale order even when the selected item has not changed', () => {
  const { original, added, detail } = fixture();
  const stale = [original, { ...added, position: 9 }];
  expect(() => moveSessionItem(detail, original, stale, 'later', at(6))).toThrow('order changed');
  const skipped = { ...original, state: 'skipped' as const };
  const itemView = sessionItemsView(detail.session, [skipped, added]);
  expect(() =>
    moveSessionItem({ ...detail, itemView }, skipped, itemView.items, 'later', at(6)),
  ).toThrow('Restore');
});
