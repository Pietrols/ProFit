import { expect, it } from 'vitest';
import { loadWorkoutTimer, saveWorkoutTimer, timerAfterLogs } from '../timerStorage';
import { pauseTimer, readTimer, resumeTimer, startTimer, timerView } from '../timers';
import { sessionId } from './fixtures';

it('retains optional rest provenance across save, pause and resume, including old timer formats', async () => {
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
  const manual = startTimer({ mode: 'rest', seconds: 60 }, 100000, 'rest');
  const linked = { ...manual, sourceSetId: sessionId };
  expect(readTimer(manual)).toEqual(manual);
  expect(readTimer(linked)).toEqual(linked);
  expect(readTimer({ ...linked, sourceSetId: 'invalid' })).toBeNull();
  expect(readTimer({ ...linked, config: { mode: 'stopwatch' } })).toBeNull();
  await saveWorkoutTimer(storage, 'a', 's', linked);
  expect(await loadWorkoutTimer(storage, 'a', 's')).toEqual(linked);
  const paused = pauseTimer(linked, 110000);
  expect(paused.sourceSetId).toBe(sessionId);
  expect(resumeTimer(paused, 120000).sourceSetId).toBe(sessionId);
});

it('discards a running or paused automatic rest whose source result was deleted', () => {
  const linked = {
    ...startTimer({ mode: 'rest', seconds: 60 }, 100000, 'rest'),
    sourceSetId: sessionId,
  };
  for (const timer of [linked, pauseTimer(linked, 110000)]) {
    expect(timerAfterLogs(timer, [], [])).toBeNull();
    expect(timerAfterLogs(timer, [new Date(99000).toISOString()], [sessionId])).toBe(timer);
  }
  // Manual and legacy timers cannot be assigned to a deleted set by guessing.
  const manual = startTimer({ mode: 'rest', seconds: 60 }, 100000, 'manual');
  expect(timerAfterLogs(manual, [], [])).toBe(manual);
});
it('does not restore an obsolete rest after a set commits before a crash', () => {
  const timer = startTimer({ mode: 'rest', seconds: 60 }, 100000, 'old');
  expect(timerAfterLogs(timer, [new Date(100001).toISOString()])).toBeNull();
  expect(timerAfterLogs(timer, [new Date(100000).toISOString()])).toBe(timer);
  expect(timerAfterLogs(null, [])).toBeNull();
});
it('restores absolute timer state without mixing users or sessions', async () => {
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
  const timer = startTimer({ mode: 'rest', seconds: 60 }, 100000, 'generation');
  await saveWorkoutTimer(storage, 'a', 'session', timer);
  expect(timerView((await loadWorkoutTimer(storage, 'a', 'session'))!, 120000).remainingMs).toBe(
    40000,
  );
  expect(await loadWorkoutTimer(storage, 'b', 'session')).toBeNull();
  expect(await loadWorkoutTimer(storage, 'a', 'other')).toBeNull();
  await saveWorkoutTimer(storage, 'a', 'session', null);
  expect(await loadWorkoutTimer(storage, 'a', 'session')).toBeNull();
});
it('reports corruption and write failures rather than silently starting over', async () => {
  const storage = {
    async getItem() {
      return '{bad';
    },
    async setItem() {
      throw new Error('disk full');
    },
    async removeItem() {},
  };
  await expect(loadWorkoutTimer(storage, 'a', 's')).rejects.toThrow('Reset');
  await expect(
    saveWorkoutTimer(storage, 'a', 's', startTimer({ mode: 'stopwatch' }, 1, 'a')),
  ).rejects.toThrow('disk full');
});
