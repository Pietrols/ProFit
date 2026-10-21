import { sessionInput, validateSession, validUuid } from './model';
import { resolveRecordRevisions } from './recordOrder';
import type { SessionItemsView } from './sessionItemsView';
import { resultValidatorForItem } from './structureModel';
import type { PerformanceTargets, WorkoutResult } from './structureTypes';
import type { WorkoutSession } from './types';

export type ResolvedWorkoutResult = {
  itemId: string;
  exerciseId: string;
  targetsAtPerformance: PerformanceTargets | null;
  log: WorkoutResult;
};
export type WorkoutResultsView = {
  results: ResolvedWorkoutResult[];
  loggedResults: ResolvedWorkoutResult[];
  unavailableResultIds: string[];
  available: boolean;
};

export function workoutResultsView(
  session: WorkoutSession & { deletedAt?: string | null },
  itemView: SessionItemsView,
  records: readonly WorkoutResult[],
  unavailableIds: readonly string[] = [],
): WorkoutResultsView {
  if (!validUuid(session.id) || session.deletedAt || validateSession(sessionInput(session)))
    return { results: [], loggedResults: [], unavailableResultIds: [], available: false };
  const items = new Map(itemView.items.map((item) => [item.id, item]));
  const originals = new Map(
    itemView.items
      .filter((item) => item.origin === 'planned')
      .map((item) => [item.originalPosition, item.id]),
  );
  const validators = new Map(
    itemView.items.map((item) => [item.id, resultValidatorForItem(session, item)]),
  );
  const scoped = records.filter((result) => result.sessionId === session.id);
  const revisions = resolveRecordRevisions(scoped);
  const unavailable = new Set([...unavailableIds, ...revisions.unavailableIds]);
  const loggedResults: ResolvedWorkoutResult[] = [];
  // Both variants share this identity space. Never resolve them in separate passes.
  for (const log of revisions.latest) {
    if (unavailable.has(log.id) || log.deletedAt) continue;
    let itemId: string;
    let targets: PerformanceTargets | null = null;
    if ('itemId' in log) {
      itemId = log.itemId;
      const validate = validators.get(itemId);
      if (!validate || validate(log)) {
        unavailable.add(log.id);
        continue;
      }
      targets = { ...log.targetsAtPerformance };
    } else {
      // Guard the namespace before deriving it from potentially damaged local data.
      if (
        !Number.isInteger(log.exercisePosition) ||
        log.exercisePosition < 0 ||
        log.exercisePosition > 99
      ) {
        unavailable.add(log.id);
        continue;
      }
      const originalId = originals.get(log.exercisePosition);
      const validate = originalId ? validators.get(originalId) : null;
      if (!originalId || !validate || validate(log)) {
        unavailable.add(log.id);
        continue;
      }
      itemId = originalId;
    }
    const copy = { ...log, logFields: [...log.logFields], values: { ...log.values } };
    if ('itemId' in copy) copy.targetsAtPerformance = { ...copy.targetsAtPerformance };
    loggedResults.push({
      itemId,
      exerciseId: items.get(itemId)!.exercise.exerciseId,
      targetsAtPerformance: targets,
      log: copy,
    });
  }
  loggedResults.sort(
    (a, b) =>
      Date.parse(a.log.loggedAt) - Date.parse(b.log.loggedAt) || a.log.id.localeCompare(b.log.id),
  );
  return {
    results: loggedResults.filter((result) => result.log.values.done !== false),
    loggedResults,
    unavailableResultIds: [...unavailable].sort(),
    available: itemView.available && unavailable.size === 0,
  };
}
