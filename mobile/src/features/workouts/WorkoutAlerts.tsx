import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '../auth/AuthProvider';
import { useSyncContext, useSyncStatus } from '../sync/SyncProvider';
import { kvStore } from '@/lib/storage/local';
import { createRestAlerts } from './restAlerts';
import { restPort, enableRestAlerts } from './notificationPort';
import { loadWorkoutTimer, timerAfterLogs } from './timerStorage';
import { getSession, listSets } from './workouts';

const Context = createContext<{ alerts: ReturnType<typeof createRestAlerts>; error: string | null;
  report(error: unknown): void; enable(): Promise<void> } | null>(null);

export function WorkoutAlerts({ children }: { children: ReactNode }) {
  const auth = useAuthStore(); const { db } = useSyncContext(); const { syncing } = useSyncStatus();
  const alerts = useMemo(() => createRestAlerts(restPort), []);
  const [error, setError] = useState<string | null>(null);
  const report = (e: unknown) => setError(e instanceof Error ? e.message : 'Could not update background rest alerts.');
  useEffect(() => {
    const read = async (user: string, session: string) => {
      const saved = await getSession(db, user, session);
      if (saved?.status !== 'active') return null;
      let timer;
      try { timer = await loadWorkoutTimer(kvStore, user, session); }
      catch (e) { report(e); return null; }
      // A crash after committing a new set must not preserve the previous set's alert.
      const logs = await listSets(db, user, session);
      return timerAfterLogs(timer, logs.map((log) => log.loggedAt));
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
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { unsubscribe(); subscription.remove(); };
  }, [alerts, auth, db, syncing]);
  return <Context.Provider value={{ alerts, error, report, enable: async () => {
    await enableRestAlerts(); setError(null);
  } }}>{children}</Context.Provider>;
}
export function useWorkoutAlerts() {
  const value = useContext(Context);
  if (!value) throw new Error('Workout alerts provider missing.');
  return value;
}
