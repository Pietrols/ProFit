import { createApiClient } from '../../lib/api/client';
import { ApiError, isNetworkError } from '../../lib/api/errors';
import { orderedKeyValue } from '../../lib/storage/ordered';
import {
  applyPatch,
  isEmptyPatch,
  mergePatches,
  parsePatch,
  remainingAfterSend,
} from '../profile/pendingChanges';
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
      userId: string;
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
  deps = { ...deps, secure: orderedKeyValue(deps.secure), kv: orderedKeyValue(deps.kv) };
  let snapshot: AuthSnapshot = { status: 'loading' };
  let auth: StoredAuth | null = null; // tokens and user, in memory
  let confirmed: Me | null = null; // last profile the server sent
  let pending: ProfilePatch = {};
  let generation = 0;
  let flushing: { generation: number; promise: Promise<void> } | null = null;
  const listeners = new Set<() => void>();

  function publish(next: AuthSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function publishSignedIn(syncError: string | null = null) {
    publish({
      status: 'signedIn',
      userId: auth!.user.id,
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
    const current = ++generation;
    const userId = auth?.user.id;
    auth = null;
    confirmed = null;
    pending = {};
    await deps.secure.removeItem(AUTH_KEY);
    if (current !== generation) return;
    if (userId) await deps.kv.removeItem(meKey(userId));
    if (current !== generation) return;
    publish({ status: 'signedOut', notice });
  }

  async function savePending(userId: string) {
    if (isEmptyPatch(pending)) await deps.kv.removeItem(pendingKey(userId));
    else await deps.kv.setItem(pendingKey(userId), JSON.stringify(pending));
  }

  async function saveConfirmed(me: Me, current: number): Promise<boolean> {
    if (current !== generation) return false;
    if (me.user.id !== auth?.user.id) throw new Error('The profile did not match this sign-in.');
    await deps.kv.setItem(meKey(me.user.id), JSON.stringify(me));
    if (current !== generation) return false;
    confirmed = me;
    return true;
  }

  // Sends unsent profile edits. Safe to call any time; overlapping calls share one request.
  function flush(): Promise<void> {
    if (flushing?.generation === generation) return flushing.promise;
    const current = generation;
    const promise = flushCurrent(current).finally(() => {
      if (flushing?.promise === promise) flushing = null;
    });
    flushing = { generation: current, promise };
    return promise;
  }
  async function flushCurrent(current: number): Promise<void> {
    if (!auth || isEmptyPatch(pending)) return;
    const userId = auth.user.id;
    const sent = pending;
    try {
      const me = await api.patch<Me>('/me', sent);
      if (current !== generation || auth?.user.id !== userId) return;
      if (!(await saveConfirmed(me, current))) return;
      pending = remainingAfterSend(sent, pending);
      await savePending(userId);
      if (current !== generation) return;
      publishSignedIn();
    } catch (error) {
      if (isNetworkError(error) || current !== generation || auth?.user.id !== userId) return;
      if (error instanceof ApiError && error.status === 400) {
        // The server will never accept these values, so retrying forever would block every later
        // edit. Drop them, keep the server's profile, and say what happened.
        pending = remainingAfterSend(sent, pending);
        await savePending(userId);
        if (current !== generation) return;
        publishSignedIn(`Some profile changes were not saved: ${error.message}`);
        return;
      }
      throw error;
    }
  }

  async function completeSignIn(response: SignInResponse, current: number): Promise<boolean> {
    if (current !== generation) return false;
    current = ++generation;
    publish({ status: 'loading' });
    const user = response.user;
    auth = { session: response.session, user };
    confirmed = null;
    pending = {};
    await deps.secure.setItem(AUTH_KEY, JSON.stringify(auth));
    if (!(await saveConfirmed({ user, profile: response.profile }, current))) return false;
    const savedPending = await deps.kv.getItem(pendingKey(user.id));
    if (current !== generation) return false;
    pending = parsePatch(savedPending);
    publishSignedIn();
    void flush().catch(() => {});
    return true;
  }

  return {
    // The API client signed in as the current user, shared with the sync engine.
    api,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // Called once at launch. Signs in from what is stored on the phone, so it works offline,
    // then catches up with the server in the background.
    async init(): Promise<void> {
      const current = ++generation;
      const stored = await deps.secure.getItem(AUTH_KEY);
      if (current !== generation) return;
      auth = parseStoredAuth(stored);
      if (!auth) return publish({ status: 'signedOut', notice: null });
      const userId = auth.user.id;
      const savedMe = await deps.kv.getItem(meKey(userId));
      if (current !== generation) return;
      const savedPending = await deps.kv.getItem(pendingKey(userId));
      if (current !== generation) return;
      confirmed = parseMe(savedMe, userId);
      pending = parsePatch(savedPending);
      publishSignedIn();
      void this.sync();
    },

    // Sends unsent edits, then fetches the latest profile. Offline it quietly does nothing.
    async sync(): Promise<void> {
      if (!auth) return;
      const current = generation;
      const userId = auth.user.id;
      try {
        await flush();
        if (current !== generation) return;
        const me = await api.get<Me>('/me');
        if (current !== generation || auth?.user.id !== userId) return;
        if (!(await saveConfirmed(me, current))) return;
        publishSignedIn(snapshot.status === 'signedIn' ? snapshot.syncError : null);
      } catch {
        // Offline, or the sign-in ended (handled by onSessionExpired). Try again next time.
      }
    },

    // Resolves to false when the user closed Google's account picker.
    async signInWithGoogle(): Promise<boolean> {
      const current = ++generation;
      const idToken = await deps.google.getIdToken();
      if (!idToken || current !== generation) return false;
      return completeSignIn(
        await api.post<SignInResponse>('/auth/google', { idToken }, { auth: false }),
        current,
      );
    },

    async signInForDevelopment(email: string, name?: string): Promise<void> {
      const current = ++generation;
      const body = name ? { email, name } : { email };
      await completeSignIn(
        await api.post<SignInResponse>('/auth/dev', body, { auth: false }),
        current,
      );
    },

    // Saves the edit on the phone straight away, then tries to send it.
    async updateProfile(patch: ProfilePatch): Promise<void> {
      if (!auth || snapshot.status !== 'signedIn' || snapshot.userId !== auth.user.id)
        throw new Error('Sign in before editing your profile.');
      const current = generation;
      const userId = auth.user.id;
      pending = mergePatches(pending, patch);
      await savePending(userId);
      if (current !== generation || auth?.user.id !== userId) return;
      publishSignedIn();
      await flush().catch(() => {});
    },

    // Tries to send unsent edits first. Whatever cannot be sent stays on the phone (see endLocally).
    async signOut(): Promise<void> {
      if (!auth) return;
      const current = generation;
      const refreshToken = auth.session.refreshToken;
      await flush().catch(() => {});
      if (current !== generation) return;
      try {
        await api.post('/auth/sign-out', { refreshToken }, { auth: false });
      } catch {
        // Offline: the server-side sign-in simply expires on its own.
      }
      if (current !== generation) return;
      await deps.google.signOut();
      if (current !== generation) return;
      await endLocally(
        isEmptyPatch(pending)
          ? null
          : 'Some profile changes have not reached the server yet. They are kept on this phone and sent when you sign in again.',
      );
    },
  };
}

export type AuthStore = ReturnType<typeof createAuthStore>;

function parseMe(raw: string | null, userId: string): Me | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Me> | null;
    return value?.user?.id === userId && value.profile ? (value as Me) : null;
  } catch {
    return null;
  }
}
