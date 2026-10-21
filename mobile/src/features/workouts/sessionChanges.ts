import { sessionInput, validateSession, validUuid } from './model';
import { sessionItemRevision } from './stablePerformance';
import { validateSessionItem } from './structureModel';
import type { StructuredWorkoutDetail } from './structuredDetail';
import type { SessionItem } from './structureTypes';
import type { SnapshotExercise } from './types';

export type AdjustmentContext = Pick<
  StructuredWorkoutDetail,
  'session' | 'itemView' | 'resultView'
>;
export type SessionTargets = Omit<SnapshotExercise, 'exerciseId' | 'name'>;
export type ItemChange =
  | { kind: 'state'; state: SessionItem['state']; reason: string | null }
  | { kind: 'targets'; targets: SessionTargets };

export function requireAdjustableSession(detail: AdjustmentContext, now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error('Check the phone date before saving.');
  if (
    !validUuid(detail.session.id) ||
    validateSession(sessionInput(detail.session)) ||
    detail.session.status !== 'active'
  )
    throw new Error('Resume an active workout before changing its exercises.');
  if (!detail.itemView.available || !detail.resultView.available)
    throw new Error('Some workout data is unavailable. Refresh before changing exercises.');
}

export function reviewedSessionItem(detail: AdjustmentContext, reviewed: SessionItem, now: Date) {
  requireAdjustableSession(detail, now);
  const current = detail.itemView.items.find((item) => item.id === reviewed.id);
  if (
    !current ||
    current.deletedAt ||
    validateSessionItem(current, detail.session) ||
    validateSessionItem(reviewed, detail.session)
  )
    throw new Error('This session exercise is unavailable. Refresh before changing it.');
  if (sessionItemRevision(current) !== sessionItemRevision(reviewed))
    throw new Error('This exercise changed. Review the refreshed workout before trying again.');
  return current;
}

export function sessionEditTime(items: readonly SessionItem[], now: Date) {
  return new Date(
    Math.max(now.getTime(), ...items.map((item) => Date.parse(item.updatedAt) + 1)),
  ).toISOString();
}

export function changeSessionItem(
  detail: AdjustmentContext,
  reviewed: SessionItem,
  change: ItemChange,
  now: Date,
): SessionItem {
  const current = reviewedSessionItem(detail, reviewed, now);
  const next = {
    ...current,
    exercise: { ...current.exercise, logFields: [...current.exercise.logFields] },
    updatedAt: sessionEditTime([current], now),
  };
  if (change.kind === 'state') {
    next.state = change.state;
    next.reason = change.reason;
  } else if (change.kind === 'targets') {
    if (current.state !== 'active')
      throw new Error('Restore this exercise before changing targets.');
    const exercise = { ...current.exercise, ...change.targets };
    if (
      exercise.exerciseId !== current.exercise.exerciseId ||
      exercise.name !== current.exercise.name
    )
      throw new Error('Replace the exercise to choose a different movement.');
    const savedTail = detail.resultView.loggedResults.some(
      ({ itemId, log }) =>
        itemId === current.id &&
        log.setIndex >= exercise.sets &&
        log.setIndex < current.exercise.sets,
    );
    if (savedTail)
      throw new Error('A saved tail set must be deleted explicitly before reducing sets.');
    next.exercise = exercise;
  } else {
    throw new Error('Choose a supported workout change.');
  }
  const error = validateSessionItem(next, detail.session);
  if (error) throw new Error(error);
  next.exercise.logFields = [...next.exercise.logFields];
  return next;
}
