import { validateSnapshotExercise, validUuid } from './model';
import {
  requireAdjustableSession,
  reviewedSessionItem,
  sessionEditTime,
  type AdjustmentContext,
} from './sessionChanges';
import { validateSessionItem } from './structureModel';
import { workoutItemProgress } from './itemProgress';
import type { SessionItem } from './structureTypes';
import type { SnapshotExercise } from './types';

export function addSessionItems(
  detail: AdjustmentContext,
  id: string,
  exercise: SnapshotExercise,
  now: Date,
  replacement?: SessionItem,
): SessionItem[] {
  requireAdjustableSession(detail, now);
  const error = validateSnapshotExercise(exercise);
  if (error) throw new Error(error);
  if (!validUuid(id) || detail.itemView.items.some((item) => item.id === id))
    throw new Error('Choose a new session exercise identity. Refresh before trying again.');
  const source = replacement ? reviewedSessionItem(detail, replacement, now) : null;
  if (source && !workoutItemProgress(detail).find((row) => row.item.id === source.id)?.canTrain)
    throw new Error('Choose an active exercise with remaining work to replace.');
  const ordered = detail.itemView.items.filter((item) => !item.deletedAt);
  if (ordered.length >= 10001)
    throw new Error('There are too many session exercises to add another.');
  const updatedAt = sessionEditTime(ordered, now);
  const newItem: SessionItem = {
    ...(source
      ? { origin: 'replacement' as const, replacesItemId: source.id }
      : { origin: 'added' as const, replacesItemId: null }),
    id,
    sessionId: detail.session.id,
    originalPosition: null,
    position: 0,
    state: 'active',
    reason: null,
    exercise: { ...exercise, logFields: [...exercise.logFields] },
    updatedAt,
    deletedAt: null,
  };
  if (source) {
    const index = ordered.findIndex((item) => item.id === source.id);
    ordered[index] = { ...source, state: 'removed' };
    ordered.splice(index + 1, 0, newItem);
  } else ordered.push(newItem);
  return ordered.flatMap((item, position) => {
    if (item.id !== id && item.id !== source?.id && item.position === position) return [];
    const changed = {
      ...item,
      position,
      updatedAt,
      exercise: { ...item.exercise, logFields: [...item.exercise.logFields] },
    };
    const error = validateSessionItem(changed, detail.session);
    if (error) throw new Error(error);
    return [changed];
  });
}
