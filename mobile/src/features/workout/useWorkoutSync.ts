import { useCallback, useEffect } from 'react';
import { api } from '../../api/client';
import { getDb } from '../../data/db';
import { pushWorkouts } from '../../data/workoutSync';
import { useAuth } from '../auth/AuthContext';

/**
 * Opportunistic push of locally logged sessions. Runs on mount (app start /
 * reconnect entry points) and on demand after finishing a workout. Failures
 * are silent — the queue just stays pending for the next attempt.
 */
export function useWorkoutSync() {
  const { session } = useAuth();

  const push = useCallback(async (): Promise<boolean> => {
    if (!session) return false;
    try {
      const db = await getDb();
      await pushWorkouts(db, (sessions) =>
        api.syncWorkouts(session.token, sessions),
      );
      return true;
    } catch {
      return false; // offline is normal; retry later
    }
  }, [session]);

  useEffect(() => {
    push();
  }, [push]);

  return { push };
}
