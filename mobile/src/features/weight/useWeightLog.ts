import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useSyncContext, useSyncStatus } from '../sync/SyncProvider';
import { deleteWeight, listWeights, saveWeight, type WeightEntry } from './weightLog';

// The signed-in user's body-weight log for screens: reads from the phone, writes to the phone and
// then asks the engine to sync. Reloads after every write and every finished sync, so entries made
// on another phone appear as soon as they arrive.
export function useWeightLog(limit = 30) {
  const { db, engine } = useSyncContext();
  const snapshot = useAuth();
  const userId = snapshot.status === 'signedIn' ? snapshot.userId : null;
  const { syncing } = useSyncStatus();
  const [entries, setEntries] = useState<WeightEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!userId || syncing) return;
    let current = true;
    listWeights(db, userId, limit).then(
      (rows) => current && (setEntries(rows), setError(null)),
      (e: unknown) => current && setError(e instanceof Error ? e.message : 'Could not read your weight log.'),
    );
    return () => {
      current = false;
    };
  }, [db, userId, limit, revision, syncing]);

  const save = useCallback(
    async (date: string, weightKg: number, note?: string | null) => {
      if (!userId) return;
      await saveWeight(db, userId, { date, weightKg, note }, new Date());
      setRevision((r) => r + 1);
      void engine.noteLocalChange();
    },
    [db, engine, userId],
  );

  const remove = useCallback(
    async (date: string) => {
      if (!userId) return;
      await deleteWeight(db, userId, date, new Date());
      setRevision((r) => r + 1);
      void engine.noteLocalChange();
    },
    [db, engine, userId],
  );

  return { entries, error, save, remove };
}
