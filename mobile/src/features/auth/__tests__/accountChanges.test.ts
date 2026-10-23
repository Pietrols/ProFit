import { expect, it } from 'vitest';
import { createAuthStore, meKey, pendingKey, type KeyValue } from '../authStore';
import type { Me } from '../../profile/types';

const profile: Me['profile'] = {
  goal: null,
  experience: null,
  trainingPlace: null,
  unitSystem: 'metric',
  birthYear: null,
  sex: null,
  heightCm: null,
  daysPerWeek: null,
  limitations: null,
  onboardingStatus: 'skipped',
  updatedAt: '2026-10-22T10:00:00Z',
};
function gate() {
  let release!: () => void;
  let begin!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    begin = resolve;
  });
  return {
    started,
    release: () => release(),
    wait: async () => {
      begin();
      await pending;
    },
  };
}
function memory() {
  const data = new Map<string, string>();
  const port: KeyValue = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
  return { data, port };
}
function fixture() {
  const secure = memory();
  const kv = memory();
  const accounts = Object.fromEntries(
    ['first', 'second'].map((id) => [
      id,
      {
        user: { id, email: `${id}@example.invalid`, displayName: id, avatarUrl: null },
        profile: { ...profile },
      },
    ]),
  ) as Record<string, Me>;
  const state = { holdLogin: null as ReturnType<typeof gate> | null };
  const store = createAuthStore({
    secure: secure.port,
    kv: kv.port,
    baseUrl: 'http://api.test',
    google: { getIdToken: async () => null, signOut: async () => {} },
    now: () => Date.parse('2026-10-22T10:00:00Z'),
    fetch: async (url, init) => {
      if (String(url).endsWith('/auth/sign-out')) return new Response(null, { status: 204 });
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const headers = init?.headers as Record<string, string>;
      const login = String(url).endsWith('/auth/dev');
      const id = login ? body.email.split('@')[0] : headers.Authorization.slice(7);
      const me = accounts[id]!;
      if (login && id === 'first' && state.holdLogin) await state.holdLogin.wait();
      if (init?.method === 'PATCH') Object.assign(me.profile, body);
      const session = {
        accessToken: id,
        refreshToken: `refresh-${id}`,
        accessTokenExpiresAt: '2999-01-01T00:00:00Z',
      };
      return new Response(JSON.stringify(login ? { ...me, session } : me), { status: 200 });
    },
  });
  return { store, kv, secure, accounts, state };
}

it('does not file the new account pending profile under the old account after a delayed cache write', async () => {
  const { store, kv, accounts } = fixture();
  await store.init();
  await store.signInForDevelopment('first@example.invalid');
  kv.data.set(pendingKey('second'), JSON.stringify({ limitations: 'Second account private note' }));
  const held = gate();
  const write = kv.port.setItem;
  kv.port.setItem = async (key, value) => {
    if (key === meKey('first')) await held.wait();
    await write(key, value);
  };
  const old = store.updateProfile({ limitations: 'First account note' });
  await held.started;
  await store.signInForDevelopment('second@example.invalid');
  held.release();
  await old;
  await store.sync();
  expect(JSON.parse(kv.data.get(pendingKey('first'))!)).toEqual({
    limitations: 'First account note',
  });
  expect(accounts.second!.profile.limitations).toBe('Second account private note');
  expect(accounts.first!.profile.limitations).toBe('First account note');
  expect(store.getSnapshot()).toMatchObject({ userId: 'second', me: { user: { id: 'second' } } });
});

it('does not publish an old sign-out after a new sign-in during profile-cache removal', async () => {
  const { store, kv } = fixture();
  await store.init();
  await store.signInForDevelopment('first@example.invalid');
  const held = gate();
  const remove = kv.port.removeItem;
  kv.port.removeItem = async (key) => {
    if (key === meKey('first')) await held.wait();
    await remove(key);
  };
  const old = store.signOut();
  await held.started;
  await store.signInForDevelopment('second@example.invalid');
  held.release();
  await old;
  expect(store.getSnapshot()).toMatchObject({ status: 'signedIn', userId: 'second' });
});

it('keeps the latest sign-in when an earlier login response arrives last', async () => {
  const { store, state } = fixture();
  await store.init();
  state.holdLogin = gate();
  const old = store.signInForDevelopment('first@example.invalid');
  await state.holdLogin.started;
  await store.signInForDevelopment('second@example.invalid');
  state.holdLogin.release();
  await old;
  expect(store.getSnapshot()).toMatchObject({ userId: 'second', me: { user: { id: 'second' } } });
});
