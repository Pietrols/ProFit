import { describe, expect, it } from 'vitest';
import type { Me, ProfilePatch } from '../../profile/types';
import { AUTH_KEY, createAuthStore, meKey, pendingKey, type AuthSnapshot, type KeyValue } from '../authStore';
import type { Session } from '../session';

const NOW = Date.parse('2026-10-07T10:00:00Z');

function memoryStore(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
  };
}

const baseMe: Me = {
  user: { id: 'u1', email: 'peter@example.com', displayName: 'Peter', avatarUrl: null },
  profile: {
    goal: null,
    experience: null,
    trainingPlace: null,
    unitSystem: 'metric',
    birthYear: null,
    sex: null,
    heightCm: null,
    daysPerWeek: null,
    limitations: null,
    onboardingStatus: 'pending',
    updatedAt: '2026-10-07T10:00:00.000Z',
  },
};

const sessionNo = (n: number): Session => ({
  accessToken: `access-${n}`,
  accessTokenExpiresAt: new Date(NOW + 15 * 60_000).toISOString(),
  refreshToken: `refresh-${n}`,
});

// A tiny stand-in for the API: enough of /auth and /me to drive the store.
function fakeApi() {
  const state = {
    online: true,
    me: structuredClone(baseMe),
    patches: [] as ProfilePatch[],
    signOuts: 0,
    rejectPatchWith: null as null | { status: number; code: string; message: string },
    refuseRefresh: false,
    sessions: 0,
  };
  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    if (!state.online) throw new TypeError('Network request failed');
    const path = String(url).replace('http://api.test', '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const method = init?.method ?? 'GET';
    if (method === 'POST' && (path === '/auth/dev' || path === '/auth/google')) {
      state.sessions += 1;
      return reply(200, { session: sessionNo(state.sessions), ...state.me });
    }
    if (method === 'POST' && path === '/auth/refresh') {
      if (state.refuseRefresh) return reply(401, { error: { code: 'SESSION_EXPIRED', message: 'Your session has ended.' } });
      state.sessions += 1;
      return reply(200, { session: sessionNo(state.sessions) });
    }
    if (method === 'POST' && path === '/auth/sign-out') {
      state.signOuts += 1;
      return reply(204);
    }
    if (path === '/me' && method === 'GET') return reply(200, state.me);
    if (path === '/me' && method === 'PATCH') {
      if (state.rejectPatchWith) return reply(state.rejectPatchWith.status, { error: state.rejectPatchWith });
      state.patches.push(body);
      const { displayName, ...profile } = body as ProfilePatch;
      if (displayName) state.me.user.displayName = displayName;
      state.me.profile = { ...state.me.profile, ...profile };
      return reply(200, state.me);
    }
    return reply(404, { error: { code: 'NOT_FOUND', message: path } });
  }) as typeof fetch;

  return { state, fetchFn };
}

function setup(options: { googleToken?: string | null } = {}) {
  const secure = memoryStore();
  const kv = memoryStore();
  const api = fakeApi();
  const googleSignOuts: number[] = [];
  const make = () =>
    createAuthStore({
      baseUrl: 'http://api.test',
      secure,
      kv,
      fetch: api.fetchFn,
      now: () => NOW,
      google: {
        getIdToken: async () => (options.googleToken === undefined ? 'google-id-token' : options.googleToken),
        signOut: async () => {
          googleSignOuts.push(1);
        },
      },
    });
  return { secure, kv, api, make, googleSignOuts };
}

const signedIn = (snapshot: AuthSnapshot) => {
  if (snapshot.status !== 'signedIn') throw new Error(`expected signedIn, got ${snapshot.status}`);
  return snapshot;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('auth store', () => {
  it('starts signed out when nothing is stored', async () => {
    const { make } = setup();
    const store = make();
    expect(store.getSnapshot().status).toBe('loading');
    await store.init();
    expect(store.getSnapshot()).toEqual({ status: 'signedOut', notice: null });
  });

  it('signs in, stores the tokens in the keystore and caches the profile', async () => {
    const { make, secure, kv } = setup();
    const store = make();
    await store.init();
    await store.signInForDevelopment('peter@example.com');
    const snapshot = signedIn(store.getSnapshot());
    expect(snapshot.me?.user.email).toBe('peter@example.com');
    expect(snapshot.me?.profile.onboardingStatus).toBe('pending');
    expect(JSON.parse(secure.data.get(AUTH_KEY)!).session.refreshToken).toBe('refresh-1');
    expect(kv.data.has(meKey('u1'))).toBe(true);
  });

  it('opens signed in with the cached profile when there is no connection', async () => {
    const { make, api } = setup();
    const first = make();
    await first.init();
    await first.signInForDevelopment('peter@example.com');
    await first.updateProfile({ onboardingStatus: 'skipped' });

    api.state.online = false;
    const relaunched = make();
    await relaunched.init();
    const snapshot = signedIn(relaunched.getSnapshot());
    expect(snapshot.me?.user.displayName).toBe('Peter');
    expect(snapshot.me?.profile.onboardingStatus).toBe('skipped');
  });

  it('keeps an edit made offline on the phone and sends it once the connection is back', async () => {
    const { make, api, kv } = setup();
    const store = make();
    await store.init();
    await store.signInForDevelopment('peter@example.com');

    api.state.online = false;
    await store.updateProfile({ goal: 'powerlifting', onboardingStatus: 'completed' });
    let snapshot = signedIn(store.getSnapshot());
    expect(snapshot.me?.profile.goal).toBe('powerlifting');
    expect(snapshot.hasPendingChanges).toBe(true);
    expect(kv.data.has(pendingKey('u1'))).toBe(true);
    expect(api.state.patches).toEqual([]);

    api.state.online = true;
    await store.sync();
    snapshot = signedIn(store.getSnapshot());
    expect(api.state.patches).toEqual([{ goal: 'powerlifting', onboardingStatus: 'completed' }]);
    expect(snapshot.hasPendingChanges).toBe(false);
    expect(kv.data.has(pendingKey('u1'))).toBe(false);
  });

  it('keeps unsent edits through a sign-out and sends them at the next sign-in', async () => {
    const { make, api, kv, secure, googleSignOuts } = setup();
    const store = make();
    await store.init();
    await store.signInForDevelopment('peter@example.com');

    api.state.online = false;
    await store.updateProfile({ heightCm: 181 });
    await store.signOut();
    const snapshot = store.getSnapshot();
    expect(snapshot.status).toBe('signedOut');
    expect(snapshot.status === 'signedOut' && snapshot.notice).toMatch(/kept on this phone/);
    expect(secure.data.has(AUTH_KEY)).toBe(false);
    expect(kv.data.has(pendingKey('u1'))).toBe(true);
    expect(googleSignOuts).toHaveLength(1);

    api.state.online = true;
    await store.signInForDevelopment('peter@example.com');
    await settle();
    expect(api.state.patches).toEqual([{ heightCm: 181 }]);
    expect(kv.data.has(pendingKey('u1'))).toBe(false);
  });

  it('tells the API about a sign-out when online', async () => {
    const { make, api } = setup();
    const store = make();
    await store.init();
    await store.signInForDevelopment('peter@example.com');
    await store.signOut();
    expect(api.state.signOuts).toBe(1);
    expect(store.getSnapshot()).toEqual({ status: 'signedOut', notice: null });
  });

  it('drops edits the server rejects as invalid and says so', async () => {
    const { make, api } = setup();
    const store = make();
    await store.init();
    await store.signInForDevelopment('peter@example.com');
    api.state.rejectPatchWith = { status: 400, code: 'VALIDATION_FAILED', message: 'birthYear: must be 2013 or earlier' };
    await store.updateProfile({ birthYear: 2020 });
    const snapshot = signedIn(store.getSnapshot());
    expect(snapshot.hasPendingChanges).toBe(false);
    expect(snapshot.me?.profile.birthYear).toBeNull();
    expect(snapshot.syncError).toMatch(/birthYear/);
  });

  it('stays signed out when the user closes the Google account picker', async () => {
    const { make } = setup({ googleToken: null });
    const store = make();
    await store.init();
    await expect(store.signInWithGoogle()).resolves.toBe(false);
    expect(store.getSnapshot().status).toBe('signedOut');
  });

  it('signs in with a Google ID token', async () => {
    const { make } = setup();
    const store = make();
    await store.init();
    await expect(store.signInWithGoogle()).resolves.toBe(true);
    expect(store.getSnapshot().status).toBe('signedIn');
  });
});

describe('auth store with an ended sign-in', () => {
  it('signs out locally with a notice, keeping unsent edits', async () => {
    const secure = memoryStore();
    const kv = memoryStore();
    const api = fakeApi();
    // Stored session whose access token already expired, so the next call must refresh.
    secure.data.set(
      AUTH_KEY,
      JSON.stringify({
        session: { accessToken: 'old', accessTokenExpiresAt: new Date(NOW - 1000).toISOString(), refreshToken: 'stolen-or-old' },
        user: baseMe.user,
      }),
    );
    kv.data.set(pendingKey('u1'), JSON.stringify({ goal: 'athlete' }));
    api.state.refuseRefresh = true;
    const store = createAuthStore({
      baseUrl: 'http://api.test',
      secure,
      kv,
      fetch: api.fetchFn,
      now: () => NOW,
      google: { getIdToken: async () => null, signOut: async () => {} },
    });
    await store.init();
    await store.sync();
    await settle();
    const snapshot = store.getSnapshot();
    expect(snapshot.status).toBe('signedOut');
    expect(snapshot.status === 'signedOut' && snapshot.notice).toMatch(/Sign in again/);
    expect(secure.data.has(AUTH_KEY)).toBe(false);
    expect(kv.data.get(pendingKey('u1'))).toBe(JSON.stringify({ goal: 'athlete' }));
  });
});
