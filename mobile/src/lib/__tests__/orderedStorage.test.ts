import { expect, it } from 'vitest';
import { orderedKeyValue } from '../storage/ordered';

function fixture() {
  const disk = new Map<string, string>();
  let release!: () => void;
  let began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: string[] = [];
  const storage = orderedKeyValue({
    async getItem(key) {
      calls.push(`read:${key}`);
      return disk.get(key) ?? null;
    },
    async setItem(key, value) {
      calls.push(`write:${value}`);
      if (value === 'old' || value === 'fail') {
        began();
        await gate;
        if (value === 'fail') throw new Error('Disk unavailable');
      }
      disk.set(key, value);
    },
    async removeItem(key) {
      calls.push(`remove:${key}`);
      disk.delete(key);
    },
  });
  return { storage, disk, calls, started, release: () => release() };
}

it('orders an old credential write, sign-out removal, new sign-in write and subsequent read', async () => {
  const f = fixture();
  const old = f.storage.setItem('auth', 'old');
  await f.started;
  const remove = f.storage.removeItem('auth');
  const newer = f.storage.setItem('auth', 'new');
  const read = f.storage.getItem('auth');
  expect(f.calls).toEqual(['write:old']);
  await f.storage.setItem('other-account', 'independent');
  expect(f.disk.get('other-account')).toBe('independent');
  f.release();
  await Promise.all([old, remove, newer]);
  expect(await read).toBe('new');
  expect(f.disk.get('auth')).toBe('new');
  expect(f.calls).toEqual([
    'write:old',
    'write:independent',
    'remove:auth',
    'write:new',
    'read:auth',
  ]);
});

it('does not poison a key after a write failure or let a read overtake the next durable write', async () => {
  const f = fixture();
  const failed = f.storage.setItem('auth', 'fail').catch((error: unknown) => error);
  await f.started;
  const next = f.storage.setItem('auth', 'new');
  const read = f.storage.getItem('auth');
  f.release();
  expect(await failed).toBeInstanceOf(Error);
  await next;
  expect(await read).toBe('new');
});
