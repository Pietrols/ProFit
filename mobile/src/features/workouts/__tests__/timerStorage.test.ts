import { expect, it } from 'vitest';
import { loadWorkoutTimer, saveWorkoutTimer } from '../timerStorage';
import { startTimer, timerView } from '../timers';
it('restores absolute timer state without mixing users or sessions', async () => {
  const data = new Map<string, string>();
  const storage = { async getItem(key: string) { return data.get(key) ?? null; }, async setItem(key: string, value: string) { data.set(key, value); }, async removeItem(key: string) { data.delete(key); } };
  const timer = startTimer({ mode: 'rest', seconds: 60 }, 100000, 'generation');
  await saveWorkoutTimer(storage, 'a', 'session', timer);
  expect(timerView((await loadWorkoutTimer(storage, 'a', 'session'))!, 120000).remainingMs).toBe(40000);
  expect(await loadWorkoutTimer(storage, 'b', 'session')).toBeNull(); expect(await loadWorkoutTimer(storage, 'a', 'other')).toBeNull();
  await saveWorkoutTimer(storage, 'a', 'session', null); expect(await loadWorkoutTimer(storage, 'a', 'session')).toBeNull();
});
it('reports corruption and write failures rather than silently starting over', async () => {
  const storage = { async getItem() { return '{bad'; }, async setItem() { throw new Error('disk full'); }, async removeItem() {} };
  await expect(loadWorkoutTimer(storage, 'a', 's')).rejects.toThrow('Reset');
  await expect(saveWorkoutTimer(storage, 'a', 's', startTimer({ mode: 'stopwatch' }, 1, 'a'))).rejects.toThrow('disk full');
});
