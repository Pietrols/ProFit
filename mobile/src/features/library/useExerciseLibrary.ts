import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { getDb } from '../../data/db';
import {
  countExercises,
  ExerciseFilter,
  searchExercises,
} from '../../data/exercisesRepo';
import { syncExercises } from '../../data/exercisesSync';
import { Exercise } from '../../data/types';
import { useAuth } from '../auth/AuthContext';

type Status = 'loading' | 'ready' | 'error';

/**
 * Offline-first library access: always serves from device SQLite; syncs from
 * the backend when the library is empty (first run) or on explicit refresh.
 * A failed sync with local data present is still 'ready' — offline is normal.
 */
export function useExerciseLibrary(filter: ExerciseFilter) {
  const { session } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    setExercises(await searchExercises(db, filter));
  }, [filter.query, filter.category, filter.equipment, filter.homeOnly]);

  const sync = useCallback(async () => {
    if (!session) return;
    const db = await getDb();
    await syncExercises(db, (cursor) =>
      api.listExercises(session.token, cursor),
    );
    // Warm the image cache so demo media shows offline later. Fire-and-forget.
    searchExercises(db).then((all) => {
      Image.prefetch(all.map((e) => e.demoUrl), { cachePolicy: 'disk' });
    });
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDb();
        if ((await countExercises(db)) === 0) await sync();
        if (!cancelled) {
          await load();
          setStatus('ready');
        }
      } catch {
        if (!cancelled) {
          // Sync failed with an empty library → real error state.
          // With local data present we still serve offline.
          const db = await getDb().catch(() => null);
          const n = db ? await countExercises(db) : 0;
          if (n > 0) {
            await load();
            setStatus('ready');
          } else {
            setStatus('error');
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, sync]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await sync();
      await load();
      setStatus('ready');
    } catch {
      // refresh failure is non-fatal; keep serving local data
    } finally {
      setRefreshing(false);
    }
  }, [sync, load]);

  return { status, exercises, refresh, refreshing };
}
