import type { SessionItemsView } from './sessionItemsView';
import { plannedItemId } from './structureIdentity';
import { capturePerformanceTargets } from './structureTargets';
import type { PerformanceTargets, SessionItem } from './structureTypes';
import type { SetValues, SnapshotExercise, WorkoutSession } from './types';
import type { ResolvedWorkoutResult, WorkoutResultsView } from './workoutResultsView';

const fields = ['reps', 'time', 'distance', 'rest'] as const;
type Metric = (typeof fields)[number];
const targetKeys = {
  reps: 'targetReps',
  time: 'targetTimeSeconds',
  distance: 'targetDistanceMetres',
  rest: 'restSeconds',
} as const;

export function compareSetTargets(result: ResolvedWorkoutResult) {
  return fields.map((field) => {
    const actual = result.log.logFields.includes(field) ? (result.log.values[field] ?? null) : null;
    const target = result.targetsAtPerformance?.[targetKeys[field]] ?? null;
    return {
      field,
      actual,
      target,
      difference: actual === null || target === null ? null : actual - target,
    };
  });
}
export type ComparedSet = {
  result: ResolvedWorkoutResult;
  complete: boolean;
  metrics: ReturnType<typeof compareSetTargets>;
};
export type ComparedExercise = {
  id: string;
  original: SnapshotExercise | null;
  originalTargets: PerformanceTargets | null;
  item: SessionItem | null;
  adjustedTargets: PerformanceTargets | null;
  sets: ComparedSet[];
  completed: number;
  currentTargetSets: number;
  missing: number;
  originalCompleted: number;
  originalOmitted: number;
};

// The owned views have resolved revisions, tombstones and legacy/stable identity together.
export function compareSession(
  session: WorkoutSession,
  itemView: SessionItemsView,
  resultView: WorkoutResultsView,
) {
  const items = new Map(itemView.items.map((item) => [item.id, item]));
  const results = new Map<string, ResolvedWorkoutResult[]>();
  for (const result of resultView.loggedResults) {
    const group = results.get(result.itemId) ?? [];
    group.push(result);
    results.set(result.itemId, group);
  }
  const originals = session.snapshot.exercises.map((original, position) => ({
    id: plannedItemId(session.id, position),
    original,
  }));
  const additional = itemView.items
    .filter((item) => item.origin !== 'planned')
    .map((item) => ({ id: item.id, original: null }));
  const rows: ComparedExercise[] = [...originals, ...additional].map(({ id, original }) => {
    const item = items.get(id) ?? null;
    const completedSlots = new Set(
      (results.get(id) ?? [])
        .filter((row) => row.log.values.done !== false)
        .map((row) => row.log.setIndex),
    );
    const currentTargetSets =
      item && !item.deletedAt && item.state === 'active' ? item.exercise.sets : 0;
    const completedCurrent = [...completedSlots].filter(
      (index) => index < currentTargetSets,
    ).length;
    let originalCompleted = 0;
    let originalOmitted = 0;
    for (let index = 0; index < (original?.sets ?? 0); index += 1) {
      if (completedSlots.has(index)) originalCompleted += 1;
      else if (item && index >= currentTargetSets) originalOmitted += 1;
    }
    return {
      id,
      original,
      originalTargets: original
        ? capturePerformanceTargets(original, session.snapshot.difficulty, false)
        : null,
      item,
      adjustedTargets: item
        ? capturePerformanceTargets(item.exercise, session.snapshot.difficulty, session.easierToday)
        : null,
      sets: (results.get(id) ?? []).map((result) => ({
        result,
        complete: result.log.values.done !== false,
        metrics: compareSetTargets(result),
      })),
      completed: completedSlots.size,
      currentTargetSets,
      missing: currentTargetSets - completedCurrent,
      originalCompleted,
      originalOmitted,
    };
  });
  return { available: itemView.available && resultView.available, rows };
}

export function targetValues(targets: PerformanceTargets): Pick<SetValues, Metric> {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = targets[targetKeys[field]];
      return value === null ? [] : [[field, value]];
    }),
  );
}
