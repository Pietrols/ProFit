import { createApiClient } from '../../lib/api/client';
import { ApiError, isNetworkError } from '../../lib/api/errors';
import { singleFlight } from '../../lib/singleFlight';
import { applyPatch, isEmptyPatch, mergePatches, parsePatch, remainingAfterSend } from '../profile/pendingChanges';
import type { Me, ProfilePatch } from '../profile/types';
import { parseStoredAuth, type Session, type StoredAuth } from './session';

// The signed-in user, their profile and their unsent profile edits, kept outside React so the API
// client and screens share one source. Dependencies are passed in, so this runs in plain Node tests.

export type KeyValue = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type GoogleAuth = {
  getIdToken(): Promise<string | null>;
  signOut(): Promise<void>;
};

type Deps = {
  baseUrl: string;
  secure: KeyValue; // the keystore: tokens
  kv: KeyValue; // cached profile and unsent edits
  google: GoogleAuth;
  fetch?: typeof fetch;
  now?: () => number;
};

export type AuthSnapshot =
  | { status: 'loading' }
  | { status: 'signedOut'; notice: string | null }
  | {
      status: 'signedIn';
      // What the screens show: the last profile the server confirmed with unsent edits on top.
      // null until a profile has been loaded at least once on this phone.
      me: Me | null;
      hasPendingChanges: boolean;
      syncError: string | null;
    };

type SignInResponse = { session: Session } & Me;

export const AUTH_KEY = 'profit.auth';
export const meKey = (userId: string) => `profit.me.${userId}`;
export const pendingKey = (userId: string) => `profit.pendingProfile.${userId}`;

export function createAuthStore(deps: Deps) {
  let snapshot: AuthSnapshot = { status: 'loading' };
  let auth: StoredAuth | null = null; // tokens and user, in memory
  let confirmed: Me | null = null; // last profile the server sent
  let pending: ProfilePatch = {};
  const listeners = new Set<() => void>();

  function publish(next: AuthSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function publishSignedIn(syncError: string | null = null) {
    publish({
      status: 'signedIn',
      me: confirmed ? applyPatch(confirmed, pending) : null,
      hasPendingChanges: !isEmptyPatch(pending),
      syncError,
    });
  }

  const api = createApiClient({
    baseUrl: deps.baseUrl,
    fetch: deps.fetch,
    now: deps.now,
    getSession: () => auth?.session ?? null,
    saveSession: async (session) => {
      if (!auth) return;
      auth = { ...auth, session };
      await deps.secure.setItem(AUTH_KEY, JSON.stringify(auth));
    },
    onSessionExpired: () => {
      void endLocally('Your sign-in has ended. Sign in again to keep syncing.');
    },
  });

  // Forgets the sign-in on this phone. Unsent profile edits stay, filed under the user, and are
  // sent the next time that user signs in here.
  async function endLocally(notice: string | null) {
    const userId = auth?.user.id;
    auth = null;
    confirmed = null;
    pending = {};
    await deps.secure.removeItem(AUTH_KEY);
    if (userId) await deps.kv.removeItem(meKey(userId));
    publish({ status: 'signedOut', notice });
  }

  async function savePending(userId: string) {
    if (isEmptyPatch(pending)) await deps.kv.removeItem(pendingKey(userId));
    else await deps.kv.setItem(pendingKey(userId), JSON.stringify(pending));
  }

  async function saveConfirmed(me: Me) {
    confirmed = me;
    await deps.kv.setItem(meKey(me.user.id), JSON.stringify(me));
  }

  // Sends unsent profile edits. Safe to call any time; overlapping calls share one request.
  const flush = singleFlight(async (): Promise<void> => {
    if (!auth || isEmptyPatch(pending)) return;
    const userId = auth.user.id;
    const sent = pending;
    try {
      const me = await api.patch<Me>('/me', sent);
      if (auth?.user.id !== userId) return; // signed out while the request was on its way
      await saveConfirmed(me);
      pending = remainingAfterSend(sent, pending);
      await savePending(userId);
      publishSignedIn();
    } catch (error) {
      if (isNetworkError(error) || auth?.user.id !== userId) return;
      if (error instanceof ApiError && error.status === 400) {
        // The server will never accept these values, so retrying forever would block every later
        // edit. Drop them, keep the server's profile, and say what happened.
        pending = remainingAfterSend(sent, pending);
        await savePending(userId);
        publishSignedIn(`Some profile changes were not saved: ${error.message}`);
        return;
      }
      throw error;
    }
  });

  async function completeSignIn(response: SignInResponse) {
    const user = response.user;
    auth = { session: response.session, user };
    await deps.secure.setItem(AUTH_KEY, JSON.stringify(auth));
    await saveConfirmed({ user, profile: response.profile });
    pending = parsePatch(await deps.kv.getItem(pendingKey(user.id)));
    publishSignedIn();
    void flush().catch(() => {});
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // Called once at launch. Signs in from what is stored on the phone, so it works offline,
    // then catches up with the server in the background.
    async init(): Promise<void> {
      auth = parseStoredAuth(await deps.secure.getItem(AUTH_KEY));
      if (!auth) return publish({ status: 'signedOut', notice: null });
      confirmed = parseMe(await deps.kv.getItem(meKey(auth.user.id)));
      pending = parsePatch(await deps.kv.getItem(pendingKey(auth.user.id)));
      publishSignedIn();
      void this.sync();
    },

    // Sends unsent edits, then fetches the latest profile. Offline it quietly does nothing.
    async sync(): Promise<void> {
      if (!auth) return;
      const userId = auth.user.id;
      try {
        await flush();
        const me = await api.get<Me>('/me');
        if (auth?.user.id !== userId) return;
        await saveConfirmed(me);
        publishSignedIn(snapshot.status === 'signedIn' ? snapshot.syncError : null);
      } catch {
        // Offline, or the sign-in ended (handled by onSessionExpired). Try again next time.
      }
    },

    // Resolves to false when the user closed Google's account picker.
    async signInWithGoogle(): Promise<boolean> {
      const idToken = await deps.google.getIdToken();
      if (!idToken) return false;
      await completeSignIn(await api.post<SignInResponse>('/auth/google', { idToken }, { auth: false }));
      return true;
    },

    async signInForDevelopment(email: string, name?: string): Promise<void> {
      const body = name ? { email, name } : { email };
      await completeSignIn(await api.post<SignInResponse>('/auth/dev', body, { auth: false }));
    },

    // Saves the edit on the phone straight away, then tries to send it.
    async updateProfile(patch: ProfilePatch): Promise<void> {
      if (!auth) throw new Error('Sign in before editing your profile.');
      pending = mergePatches(pending, patch);
      await savePending(auth.user.id);
      publishSignedIn();
      await flush().catch(() => {});
    },

    // Tries to send unsent edits first. Whatever cannot be sent stays on the phone (see endLocally).
    async signOut(): Promise<void> {
      if (!auth) return;
      const refreshToken = auth.session.refreshToken;
      await flush().catch(() => {});
      try {
        await api.post('/auth/sign-out', { refreshToken }, { auth: false });
      } catch {
        // Offline: the server-side sign-in simply expires on its own.
      }
      await deps.google.signOut();
      await endLocally(
        isEmptyPatch(pending)
          ? null
          : 'Some profile changes have not reached the server yet. They are kept on this phone and sent when you sign in again.',
      );
    },
  };
}

export type AuthStore = ReturnType<typeof createAuthStore>;

function parseMe(raw: string | null): Me | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Me> | null;
    return value?.user && value.profile ? (value as Me) : null;
  } catch {
    return null;
  }
}
