import type { WorkoutResult } from './structureTypes';

const fields = ['weight', 'reps', 'time', 'distance'] as const;
function recorded(log: WorkoutResult, field: (typeof fields)[number]) {
  return log.logFields.includes(field) ? (log.values[field] ?? null) : null;
}
const side = (log: WorkoutResult) => ('side' in log ? log.side : 'bilateral');

// The caller supplies two performances of the same exercise, in the same canonical units.
// These are differences, not progression advice or a claim that a larger value is better.
export function comparePerformances(current: WorkoutResult, previous: WorkoutResult | null) {
  if (!previous) return { reason: 'No earlier result on this page.', metrics: [] };
  if (side(current) !== side(previous))
    return { reason: 'These entries record different sides.', metrics: [] };
  if (current.values.done === false || previous.values.done === false)
    return { reason: 'Incomplete entries are not compared.', metrics: [] };
  const sameLoad =
    (!current.logFields.includes('weight') && !previous.logFields.includes('weight')) ||
    (recorded(current, 'weight') !== null &&
      recorded(current, 'weight') === recorded(previous, 'weight'));
  const sameTime =
    recorded(current, 'time') !== null && recorded(current, 'time') === recorded(previous, 'time');
  const sameDistance =
    recorded(current, 'distance') !== null &&
    recorded(current, 'distance') === recorded(previous, 'distance');
  const metrics = fields.flatMap((field) => {
    const value = recorded(current, field);
    const before = recorded(previous, field);
    if (value === null || before === null) return [];
    if (field === 'reps' && !sameLoad) return [];
    if (
      field === 'time' &&
      (current.logFields.includes('distance') || previous.logFields.includes('distance')) &&
      !sameDistance
    )
      return [];
    if (
      field === 'distance' &&
      (current.logFields.includes('time') || previous.logFields.includes('time')) &&
      !sameTime
    )
      return [];
    return [{ field, value, previous: before, change: value - before }];
  });
  return {
    reason: metrics.length
      ? null
      : 'No comparable recorded values. Load, distance, time or fields differ.',
    metrics,
  };
}

export function previousWorkoutPerformance<T extends { sessionId: string; log: WorkoutResult }>(
  entries: readonly T[],
  index: number,
): T | null {
  const current = entries[index];
  if (!current) return null;
  return (
    entries
      .slice(index + 1)
      .find(
        (candidate) =>
          candidate.sessionId !== current.sessionId && side(candidate.log) === side(current.log),
      ) ?? null
  );
}
