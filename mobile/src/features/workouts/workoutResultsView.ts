import { sessionInput, validateSession, validTime, validUuid } from './model';
import { latestRecords } from './recordOrder';
import type { SessionItemsView } from './sessionItemsView';
import { plannedItemId } from './structureIdentity';
import { validateLegacySetContext, validateStableSetContext } from './structureModel';
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
    return { results: [], unavailableResultIds: [], available: false };
  const items = new Map(itemView.items.map((item) => [item.id, item]));
  const scoped = records.filter((result) => result.sessionId === session.id);
  const unavailable = new Set([
    ...unavailableIds,
    ...scoped.filter((result) => !validTime(result.updatedAt)).map((result) => result.id),
  ]);
  const results: ResolvedWorkoutResult[] = [];
  // Both variants share this identity space. Never resolve them in separate passes.
  for (const log of latestRecords(scoped)) {
    if (unavailable.has(log.id) || log.deletedAt) continue;
    let itemId: string;
    let targets: PerformanceTargets | null = null;
    if ('itemId' in log) {
      itemId = log.itemId;
      const item = items.get(itemId);
      if (!item || validateStableSetContext(log, item, session)) {
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
      itemId = plannedItemId(session.id, log.exercisePosition);
      const item = items.get(itemId);
      if (
        !item ||
        'side' in log ||
        'targetsAtPerformance' in log ||
        validateLegacySetContext(log, item, session)
      ) {
        unavailable.add(log.id);
        continue;
      }
    }
    if (log.values.done === false) continue;
    const copy = { ...log, logFields: [...log.logFields], values: { ...log.values } };
    if ('itemId' in copy) copy.targetsAtPerformance = { ...copy.targetsAtPerformance };
    results.push({
      itemId,
      exerciseId: items.get(itemId)!.exercise.exerciseId,
      targetsAtPerformance: targets,
      log: copy,
    });
  }
  return {
    results: results.sort(
      (a, b) =>
        Date.parse(a.log.loggedAt) - Date.parse(b.log.loggedAt) || a.log.id.localeCompare(b.log.id),
    ),
    unavailableResultIds: [...unavailable].sort(),
    available: itemView.available && unavailable.size === 0,
  };
}
