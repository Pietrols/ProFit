import { useCallback, useEffect, useState } from 'react';
import { api, NetworkError } from '../../api/client';
import { getDb } from '../../data/db';
import {
  getActivePlanLocal,
  Plan,
  saveActivePlan,
} from '../../data/planRepo';
import { ExerciseCategory } from '../../data/types';
import { useAuth } from '../auth/AuthContext';

type Status = 'loading' | 'ready' | 'error';

/**
 * Offline-first active plan: serve the local copy immediately, refresh from
 * the server in the background when reachable.
 */
export function usePlan() {
  const { session } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [plan, setPlan] = useState<Plan | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    const db = await getDb();
    try {
      const { plan: remote } = await api.getActivePlan(session.token);
      await saveActivePlan(db, remote);
      setPlan(remote);
      setStatus('ready');
    } catch (e) {
      const local = await getActivePlanLocal(db);
      if (local || e instanceof NetworkError) {
        setPlan(local);
        setStatus('ready'); // offline with (or without) a cached plan is normal
      } else {
        setStatus('error');
      }
    }
  }, [session]);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const local = await getActivePlanLocal(db);
      if (local) {
        setPlan(local);
        setStatus('ready');
      }
      await refresh();
    })();
  }, [refresh]);

  const create = useCallback(
    async (input: {
      context: 'home' | 'gym';
      days: { category: ExerciseCategory }[];
    }) => {
      if (!session) throw new Error('Not logged in');
      const { plan: created } = await api.createPlan(session.token, input);
      await saveActivePlan(await getDb(), created);
      setPlan(created);
      setStatus('ready');
      return created;
    },
    [session],
  );

  return { status, plan, refresh, create };
}
