import type { Difficulty } from '../plans/types';
import { sessionInput, validateSession, validTime, validUuid } from './model';
import { sessionSlotId } from './structureIdentity';
import {
  validateLegacySetContext,
  validateSessionItem,
  validateStableSetContext,
} from './structureModel';
import { capturePerformanceTargets } from './structureTargets';
import type { SessionItem, StableSetLog, WorkoutResult } from './structureTypes';
import type { SetValues, WorkoutSession } from './types';

export type StablePerformanceInput = {
  item: SessionItem;
  setIndex: number;
  values: SetValues;
  difficulty: Difficulty;
  easierToday: boolean;
};

export function sessionItemRevision(item: SessionItem): string {
  const exercise = item.exercise;
  return JSON.stringify([
    item.id,
    item.sessionId,
    item.origin,
    item.originalPosition,
    item.replacesItemId,
    item.position,
    item.state,
    item.reason,
    item.updatedAt,
    item.deletedAt,
    exercise.exerciseId,
    exercise.name,
    exercise.sets,
    exercise.targetReps,
    exercise.targetTimeSeconds,
    exercise.targetDistanceMetres,
    exercise.restSeconds,
    exercise.logFields,
  ]);
}

export function prepareStablePerformance(
  session: WorkoutSession & { deletedAt?: string | null },
  item: SessionItem,
  input: StablePerformanceInput,
  previous: WorkoutResult | null,
  now: Date,
): StableSetLog & { deletedAt: null } {
  if (!Number.isFinite(now.getTime())) throw new Error('Check the phone date before logging.');
  if (
    !validUuid(session.id) ||
    session.deletedAt ||
    validateSession(sessionInput(session)) ||
    session.status !== 'active'
  )
    throw new Error('Resume an active workout before logging a new performance.');
  if (validateSessionItem(item, session) || validateSessionItem(input.item, session))
    throw new Error('This session exercise is unavailable. Refresh before logging.');
  if (
    sessionItemRevision(item) !== sessionItemRevision(input.item) ||
    session.snapshot.difficulty !== input.difficulty ||
    session.easierToday !== input.easierToday
  )
    throw new Error('This workout changed. Review the refreshed exercise before logging.');
  if (item.deletedAt || item.state !== 'active')
    throw new Error('This exercise is not available for logging.');
  const id = sessionSlotId(item, input.setIndex);
  if (previous) {
    const error =
      'itemId' in previous
        ? validateStableSetContext(previous, item, session)
        : validateLegacySetContext(previous, item, session);
    if (
      previous.id !== id ||
      error ||
      !validTime(previous.updatedAt) ||
      (previous.deletedAt != null && !validTime(previous.deletedAt))
    )
      throw new Error('The saved slot is unavailable. Refresh before logging.');
    if (!previous.deletedAt)
      throw new Error(
        'This slot already has a result. Review, correct or delete it before logging again.',
      );
  }
  const loggedAt = now.toISOString();
  const result: StableSetLog & { deletedAt: null } = {
    id,
    sessionId: session.id,
    exercisePosition: item.originalPosition,
    setIndex: input.setIndex,
    itemId: item.id,
    side: 'bilateral',
    loggedAt,
    updatedAt: previous
      ? new Date(Math.max(now.getTime(), Date.parse(previous.updatedAt) + 1)).toISOString()
      : loggedAt,
    deletedAt: null,
    logFields: [...item.exercise.logFields],
    values: { ...input.values },
    targetsAtPerformance: capturePerformanceTargets(
      item.exercise,
      session.snapshot.difficulty,
      session.easierToday,
    ),
  };
  const error = validateStableSetContext(result, item, session);
  if (error) throw new Error(error);
  return result;
}
