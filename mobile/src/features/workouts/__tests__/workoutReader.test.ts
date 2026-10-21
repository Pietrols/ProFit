import { expect, it, vi } from 'vitest';
import { createWorkoutReader, refreshAfterSync } from '../workoutReader';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it('refreshes once at sync completion, without rereading on start or pending-count updates', () => {
  let syncing = false;
  let listener: (() => void) | null = null;
  const source = {
    getStatus: () => ({ syncing }),
    subscribe(callback: () => void) {
      listener = callback;
      return () => {
        listener = null;
      };
    },
  };
  const refresh = vi.fn(async () => true);
  const unsubscribe = refreshAfterSync(source, refresh);
  const emit = (next: boolean) => {
    syncing = next;
    listener?.();
  };
  emit(false);
  emit(true);
  emit(true);
  expect(refresh).not.toHaveBeenCalled();
  emit(false);
  emit(false);
  expect(refresh).toHaveBeenCalledOnce();
  unsubscribe();
  emit(true);
  emit(false);
  expect(refresh).toHaveBeenCalledOnce();
});

it('does not let a slow pre-save read replace a newer post-save result', async () => {
  const before = deferred<string>();
  const after = deferred<string>();
  const publish = vi.fn();
  const reader = createWorkoutReader({
    user: 'a',
    owner: () => 'a',
    load: vi.fn().mockReturnValueOnce(before.promise).mockReturnValueOnce(after.promise),
    publish,
    fail: vi.fn(),
  });
  const oldRead = reader.refresh();
  const newRead = reader.refresh();
  after.resolve('saved');
  expect(await newRead).toBe(true);
  before.resolve('old');
  expect(await oldRead).toBe(false);
  expect(publish.mock.calls).toEqual([['saved']]);
});

it.each(['account', 'blur'] as const)(
  'discards late success and failure after %s changes',
  async (change) => {
    for (const rejected of [false, true]) {
      let owner = 'a';
      const pending = deferred<string>();
      const publish = vi.fn();
      const fail = vi.fn();
      const reader = createWorkoutReader({
        user: 'a',
        owner: () => owner,
        load: () => pending.promise,
        publish,
        fail,
      });
      const reading = reader.refresh();
      if (change === 'account') owner = 'b';
      else reader.dispose();
      if (rejected) pending.reject(new Error('old account read failed'));
      else pending.resolve('old account data');
      expect(await reading).toBe(false);
      expect(publish).not.toHaveBeenCalled();
      expect(fail).not.toHaveBeenCalled();
    }
  },
);

it('reports current failures without claiming a successful refresh or making foreign reads', async () => {
  let owner: string | null = 'a';
  const error = new Error('storage unavailable');
  const load = vi.fn(async () => {
    throw error;
  });
  const fail = vi.fn();
  const reader = createWorkoutReader({
    user: 'a',
    owner: () => owner,
    load,
    publish: vi.fn(),
    fail,
  });
  expect(await reader.refresh()).toBe(false);
  expect(fail).toHaveBeenCalledWith(error);
  owner = null;
  expect(await reader.refresh()).toBe(false);
  expect(load).toHaveBeenCalledOnce();
});
