import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { config } from '@/config';
import { kvStore } from '@/lib/storage/local';
import { secureStorage } from '@/lib/storage/secure';
import { createAuthStore, type AuthSnapshot, type AuthStore } from './authStore';
import { getGoogleIdToken, signOutOfGoogle } from './google';
import { areaFor, type Area } from './routing';

// One auth store for the whole app, wired to the phone's keystore, its key-value file and Google.
const store = createAuthStore({
  baseUrl: config.apiUrl,
  secure: secureStorage,
  kv: kvStore,
  google: { getIdToken: getGoogleIdToken, signOut: signOutOfGoogle },
});

const AuthContext = createContext<AuthStore | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void store.init();
    // Catch up with the server whenever the app comes back to the foreground.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void store.sync();
    });
    return () => subscription.remove();
  }, []);

  return <AuthContext.Provider value={store}>{children}</AuthContext.Provider>;
}

export function useAuthStore(): AuthStore {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuthStore must be used inside AuthProvider');
  return value;
}

export function useAuth(): AuthSnapshot {
  const auth = useAuthStore();
  return useSyncExternalStore(auth.subscribe, auth.getSnapshot, auth.getSnapshot);
}

// The signed-in user's profile as the screens should show it. Throws outside the signed-in area,
// which the route guards make impossible.
export function useMe() {
  const snapshot = useAuth();
  if (snapshot.status !== 'signedIn') throw new Error('useMe is only available while signed in');
  return snapshot;
}

export function useArea(): Area {
  const snapshot = useAuth();
  if (snapshot.status !== 'signedIn') return areaFor(snapshot.status, null);
  return areaFor('signedIn', snapshot.me?.profile.onboardingStatus ?? null);
}
