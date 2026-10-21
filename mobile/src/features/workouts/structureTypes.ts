import type { SetLog, SnapshotExercise } from './types';

type ItemOrigin =
  | { origin: 'planned'; originalPosition: number; replacesItemId: null }
  | { origin: 'added'; originalPosition: null; replacesItemId: null }
  | { origin: 'replacement'; originalPosition: null; replacesItemId: string };

export type SessionItem = ItemOrigin & {
  id: string;
  sessionId: string;
  position: number;
  state: 'active' | 'skipped' | 'removed';
  reason: string | null;
  exercise: SnapshotExercise;
  updatedAt: string;
  deletedAt: string | null;
};
export type PerformanceTargets = Pick<
  SnapshotExercise,
  'sets' | 'targetReps' | 'targetTimeSeconds' | 'targetDistanceMetres' | 'restSeconds'
>;
export type StableSetLog = Omit<SetLog, 'exercisePosition'> & {
  exercisePosition: number | null;
  itemId: string;
  side: 'bilateral';
  targetsAtPerformance: PerformanceTargets;
};
export type WorkoutResult = (SetLog | StableSetLog) & { deletedAt?: string | null };
