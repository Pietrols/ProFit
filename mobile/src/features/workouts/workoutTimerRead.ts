import type { Database } from '../../lib/db/database';
import { readStructuredWorkout } from './structureReads';
import { loadWorkoutTimer, timerAfterLogs, type WorkoutTimerStorage } from './timerStorage';

export async function readWorkoutTimer(
  db: Database,
  store: WorkoutTimerStorage,
  user: string,
  sessionId: string,
) {
  const timer = await loadWorkoutTimer(store, user, sessionId);
  const saved = await readStructuredWorkout(db, user, sessionId);
  if (saved?.session.status !== 'active' || !saved.resultView.available) return null;
  return timerAfterLogs(
    timer,
    saved.resultView.loggedResults.map((row) => row.log.loggedAt),
    saved.resultView.results.map((row) => row.log.id),
  );
}
