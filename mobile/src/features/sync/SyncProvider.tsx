import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { getAppDatabase } from '@/lib/db/appDatabase';
import type { Database } from '@/lib/db/database';
import { useAuth, useAuthStore } from '../auth/AuthProvider';
import { mediaFiles } from '../media/files';
import { createMediaSync, type MediaSync } from '../media/mediaSync';
import { syncedCollections } from './collections';
import { createSyncEngine, type SyncEngine, type SyncStatus } from './engine';

// Opens the phone's database, runs the sync engine for whoever is signed in, and syncs at sign-in,
// when the app returns to the foreground, and every minute while changes are waiting. Photos go up
// at the start of each run, before the records that point at them.

const RETRY_MS = 60_000;

type SyncValue = { db: Database; engine: SyncEngine; photos: MediaSync };

const SyncContext = createContext<SyncValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuthStore();
  const snapshot = useAuth();
  const userId = snapshot.status === 'signedIn' ? snapshot.userId : null;
  const [db, setDb] = useState<Database | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    getAppDatabase().then(setDb, (error: unknown) => setFailed(error instanceof Error ? error.message : String(error)));
  }, []);

  const photos = useMemo(() => (db ? createMediaSync({ db, api: auth.api, files: mediaFiles }) : null), [db, auth]);
  const engine = useMemo(
    () => (db && photos ? createSyncEngine({ db, api: auth.api, collections: syncedCollections, beforePush: photos.uploadPending }) : null),
    [db, auth, photos],
  );

  useEffect(() => {
    if (!engine) return;
    void engine.setUser(userId).then(() => (userId ? engine.sync() : undefined));
  }, [engine, userId]);

  useEffect(() => {
    if (!engine) return;
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void engine.sync();
    });
    const retry = setInterval(() => {
      if (AppState.currentState === 'active' && engine.getStatus().pending > 0) void engine.sync();
    }, RETRY_MS);
    return () => {
      foreground.remove();
      clearInterval(retry);
    };
  }, [engine]);

  if (failed) throw new Error(`ProFit could not open its storage on this phone: ${failed}`);
  if (!db || !engine || !photos) return null;
  return <SyncContext.Provider value={{ db, engine, photos }}>{children}</SyncContext.Provider>;
}

export function useSyncContext(): SyncValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSyncContext must be used inside SyncProvider');
  return value;
}

export function useSyncStatus(): SyncStatus {
  const { engine } = useSyncContext();
  return useSyncExternalStore(engine.subscribe, engine.getStatus, engine.getStatus);
}
