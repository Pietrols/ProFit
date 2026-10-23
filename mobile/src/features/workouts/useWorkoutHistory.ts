import { useCallback } from 'react';
import type { Database } from '../../lib/db/database';
import { readWorkoutHistory } from './workoutHistory';
import type { WorkoutCursor, WorkoutHistoryFilters } from './workoutReads';
import { useWorkoutQuery } from './useWorkoutQuery';

export function useWorkoutHistory(filters: WorkoutHistoryFilters, cursor: WorkoutCursor | null) {
  const load = useCallback(
    (db: Database, user: string) => readWorkoutHistory(db, user, filters, cursor),
    [filters, cursor],
  );
  return useWorkoutQuery(`history:${JSON.stringify([filters, cursor])}`, load);
}
