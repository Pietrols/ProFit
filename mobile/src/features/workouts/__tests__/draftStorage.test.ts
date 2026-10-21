import { expect, it } from 'vitest';
import { recoverSetDraft, workoutDraftKey } from '../draftRecord';
import { createWorkoutDraftStore } from '../draftStorage';
import { other, sessionId, user } from './fixtures';

const scope = { user, session: sessionId, item: user, slot: other };
function fixture() {
  const data = new Map<string, string>();
  const storage = {
    async getItem(key: string) {
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      data.set(key, value);
    },
    async removeItem(key: string) {
      data.delete(key);
    },
  };
  return { data, storage, store: createWorkoutDraftStore(storage) };
}

it('recovers offline after recreating the store and isolates every owner/slot', async () => {
  const { store, storage } = fixture();
  const record = recoverSetDraft(null, 'new', { reps: 8, weight: 60.123456 }, 'metric');
  record.entry.draft.weight = 'unfinished,';
  await store.save(scope, record);
  const restarted = createWorkoutDraftStore(storage);
  expect(await restarted.load(scope)).toEqual({ record, persisted: true });
  expect((await restarted.load({ ...scope, user: other })).record).toBeNull();
  expect((await restarted.load({ ...scope, item: other })).record).toBeNull();
  expect((await restarted.load({ ...scope, slot: user })).record).toBeNull();
});

it('orders rapid typing, remount reads and cleanup behind an outstanding write', async () => {
  const { storage, data } = fixture();
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const delay = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const store = createWorkoutDraftStore({
    ...storage,
    async setItem(key, value) {
      if (calls++ === 0) {
        entered();
        await delay;
      }
      await storage.setItem(key, value);
    },
  });
  const first = recoverSetDraft(null, 'new', { reps: 8 }, 'metric');
  const last = recoverSetDraft(null, 'new', { reps: 10 }, 'metric');
  const writing = store.save(scope, first);
  await started;
  const newer = store.save(scope, last);
  const remounted = store.load(scope);
  release();
  await Promise.all([writing, newer]);
  expect((await remounted).record).toEqual(last);
  await store.clear(scope);
  expect(data.has(workoutDraftKey(scope))).toBe(false);
  expect((await createWorkoutDraftStore(storage).load(scope)).record).toBeNull();
});

it('keeps failed writes in memory across remounts and retries without poisoning the queue', async () => {
  const { storage } = fixture();
  let fail = true;
  const store = createWorkoutDraftStore({
    ...storage,
    async setItem(key, value) {
      if (fail) throw new Error('disk full');
      await storage.setItem(key, value);
    },
  });
  const record = recoverSetDraft(null, 'new', { weight: 60 }, 'imperial');
  await expect(store.save(scope, record)).rejects.toThrow('disk full');
  expect(await store.load(scope)).toEqual({ record, persisted: false });
  fail = false;
  await store.save(scope, record);
  expect(await store.load(scope)).toEqual({ record, persisted: true });
});

it('does not overwrite a corrupt or unreadable draft during recovery', async () => {
  const { data, store } = fixture();
  data.set(workoutDraftKey(scope), '{broken');
  await expect(store.load(scope)).rejects.toThrow('Retry');
  expect(data.get(workoutDraftKey(scope))).toBe('{broken');
  const offlineDisk = createWorkoutDraftStore({
    async getItem() {
      throw new Error('read failed');
    },
    async setItem() {
      throw new Error('must not write');
    },
    async removeItem() {
      throw new Error('must not remove');
    },
  });
  await expect(offlineDisk.load(scope)).rejects.toThrow('read failed');
});
