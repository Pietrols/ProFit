import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, ApiError } from '../../api/client';
import { ProfileUpdate, User } from '../../api/types';
import {
  clearSession,
  loadSession,
  saveSession,
  Session,
} from './authStorage';

interface AuthValue {
  /** true while the stored session is being restored on cold start */
  restoring: boolean;
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: ProfileUpdate) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [restoring, setRestoring] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  // Cold start: restore the persisted session so the user stays logged in
  // across force-quits. Offline-first: a network failure keeps the local
  // session; only a definitive 401 clears it.
  useEffect(() => {
    (async () => {
      const stored = await loadSession();
      if (stored) {
        setSession(stored);
        try {
          const { user } = await api.getMe(stored.token);
          await setAndPersist({ token: stored.token, user });
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            await clearSession();
            setSession(null);
          }
        }
      }
      setRestoring(false);
    })();
  }, []);

  async function setAndPersist(next: Session) {
    await saveSession(next);
    setSession(next);
  }

  const value = useMemo<AuthValue>(
    () => ({
      restoring,
      session,
      login: async (email, password) => {
        await setAndPersist(await api.login({ email, password }));
      },
      register: async (email, password, displayName) => {
        await setAndPersist(await api.register({ email, password, displayName }));
      },
      logout: async () => {
        // Best-effort server-side revocation (AUDIT S2); local logout must
        // still work offline.
        if (session) {
          try {
            await api.logout(session.token);
          } catch {
            // offline or already-invalid token — local logout proceeds
          }
        }
        await clearSession();
        setSession(null);
      },
      updateProfile: async (input) => {
        if (!session) throw new Error('Not logged in');
        const { user } = await api.updateProfile(session.token, input);
        await setAndPersist({ token: session.token, user });
      },
    }),
    [restoring, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useUser(): User {
  const { session } = useAuth();
  if (!session) throw new Error('useUser requires a logged-in session');
  return session.user;
}
