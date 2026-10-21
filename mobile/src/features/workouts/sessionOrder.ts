import { reviewedSessionItem, sessionEditTime, type AdjustmentContext } from './sessionChanges';
import { sessionItemRevision } from './stablePerformance';
import type { SessionItem } from './structureTypes';

export type MoveDirection = 'up' | 'down' | 'later';

export function moveSessionItem(
  detail: AdjustmentContext,
  reviewed: SessionItem,
  reviewedOrder: readonly SessionItem[],
  direction: MoveDirection,
  now: Date,
): SessionItem[] {
  const current = reviewedSessionItem(detail, reviewed, now);
  if (!['up', 'down', 'later'].includes(direction)) throw new Error('Choose a supported move.');
  if (current.state !== 'active') throw new Error('Restore this exercise before moving it.');
  const items = detail.itemView.items.filter((item) => !item.deletedAt);
  const expected = reviewedOrder.filter((item) => !item.deletedAt);
  if (
    JSON.stringify(items.map(sessionItemRevision)) !==
    JSON.stringify(expected.map(sessionItemRevision))
  )
    throw new Error('The exercise order changed. Review the refreshed workout before moving it.');
  const from = items.findIndex((item) => item.id === current.id);
  const to =
    direction === 'up'
      ? from - 1
      : direction === 'down'
        ? from + 1
        : direction === 'later'
          ? items.length - 1
          : -1;
  if (to < 0 || to >= items.length || from === to) return [];
  if (items.length > 10001) throw new Error('There are too many session exercises to reorder.');
  const reordered = [...items];
  reordered.splice(from, 1);
  reordered.splice(to, 0, current);
  const updatedAt = sessionEditTime(items, now);
  return reordered.flatMap((item, position) =>
    item.position === position
      ? []
      : [
          {
            ...item,
            position,
            updatedAt,
            exercise: { ...item.exercise, logFields: [...item.exercise.logFields] },
          },
        ],
  );
}
