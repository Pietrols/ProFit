import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useSyncContext, useSyncStatus } from '../sync/SyncProvider';
import { deleteCustomExercise, listCustomExercises, saveCustomExercise, type CustomExerciseInput } from './customExercises';
import { listFavouriteIds, setFavourite } from './favourites';
import { builtInExercises } from './library';
import type { Exercise } from './types';

// The whole library for screens: built-in exercises plus the user's own, and their favourites.
// Reads from the phone; reloads when the screen comes back into view and after every sync, so
// changes made on another phone or on another screen show up.
export function useExerciseLibrary() {
  const { db, engine } = useSyncContext();
  const snapshot = useAuth();
  const userId = snapshot.status === 'signedIn' ? snapshot.userId : null;
  const { syncing } = useSyncStatus();
  const [custom, setCustom] = useState<Exercise[] | null>(null);
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((r) => r + 1), []);

  useFocusEffect(reload);

  useEffect(() => {
    if (!userId || syncing) return;
    let current = true;
    Promise.all([listCustomExercises(db, userId), listFavouriteIds(db, userId)]).then(
      ([mine, favs]) => {
        if (!current) return;
        setCustom(mine);
        setFavourites(favs);
        setError(null);
      },
      (e: unknown) => current && setError(e instanceof Error ? e.message : 'Could not read the exercise library.'),
    );
    return () => {
      current = false;
    };
  }, [db, userId, revision, syncing]);

  const exercises = useMemo(() => (custom ? [...custom, ...builtInExercises()] : null), [custom]);
  const byId = useMemo(() => new Map((exercises ?? []).map((x) => [x.id, x])), [exercises]);
  const find = useCallback((id: string) => byId.get(id) ?? null, [byId]);

  const toggleFavourite = useCallback(
    async (exerciseId: string) => {
      if (!userId) return;
      const on = !favourites.has(exerciseId);
      setFavourites((prev) => {
        const next = new Set(prev);
        if (on) next.add(exerciseId);
        else next.delete(exerciseId);
        return next;
      });
      await setFavourite(db, userId, exerciseId, on, new Date());
      void engine.noteLocalChange();
    },
    [db, engine, favourites, userId],
  );

  const saveCustom = useCallback(
    async (input: CustomExerciseInput, id?: string) => {
      if (!userId) throw new Error('Sign in to save exercises.');
      const saved = await saveCustomExercise(db, userId, input, new Date(), id);
      reload();
      void engine.noteLocalChange();
      return saved;
    },
    [db, engine, userId, reload],
  );

  const deleteCustom = useCallback(
    async (id: string) => {
      if (!userId) return;
      await deleteCustomExercise(db, userId, id, new Date());
      reload();
      void engine.noteLocalChange();
    },
    [db, engine, userId, reload],
  );

  return { exercises, favourites, error, find, toggleFavourite, saveCustom, deleteCustom, retry: reload };
}
