import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '../auth/AuthProvider';
import { useSyncContext, useSyncStatus } from '../sync/SyncProvider';
import { kvStore } from '@/lib/storage/local';
import { createRestAlerts } from './restAlerts';
import { restPort, enableRestAlerts } from './notificationPort';
import { loadWorkoutTimer, timerAfterLogs } from './timerStorage';
import { readWorkout } from './workouts';
import { completedSets } from './logic';

const Context = createContext<{
  alerts: ReturnType<typeof createRestAlerts>;
  error: string | null;
  report(error: unknown): void;
  enable(): Promise<void>;
} | null>(null);

export function WorkoutAlerts({ children }: { children: ReactNode }) {
  const auth = useAuthStore();
  const { db } = useSyncContext();
  const { syncing } = useSyncStatus();
  const alerts = useMemo(() => createRestAlerts(restPort), []);
  const [error, setError] = useState<string | null>(null);
  const report = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : 'Could not update background rest alerts.');
  }, []);
  useEffect(() => {
    const read = async (user: string, session: string) => {
      let timer;
      try {
        timer = await loadWorkoutTimer(kvStore, user, session);
      } catch (e) {
        report(e);
        return null;
      }
      const saved = await db.transaction((tx) => readWorkout(tx, user, session));
      if (saved?.session.status !== 'active') return null;
      const logs = completedSets(saved.session, saved.logs);
      // A committed replacement or source deletion invalidates the old alert after a crash.
      return timerAfterLogs(
        timer,
        logs.map((log) => log.loggedAt),
        logs.map((log) => log.id),
      );
    };
    const refresh = () => {
      const state = auth.getSnapshot();
      if (state.status === 'loading') return;
      void alerts.setUser(state.status === 'signedIn' ? state.userId : null).catch(report);
      void alerts.reconcile(read).catch(report);
    };
    refresh();
    // Subscribe directly so sign-out invalidates an in-flight schedule before React rerenders.
    const unsubscribe = auth.subscribe(refresh);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, [alerts, auth, db, report, syncing]);
  return (
    <Context.Provider
      value={{
        alerts,
        error,
        report,
        enable: async () => {
          await enableRestAlerts();
          setError(null);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkoutAlerts() {
  const value = useContext(Context);
  if (!value) throw new Error('Workout alerts provider missing.');
  return value;
}
