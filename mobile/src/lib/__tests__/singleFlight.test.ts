import { describe, expect, it } from 'vitest';
import { singleFlight } from '../singleFlight';

describe('singleFlight', () => {
  it('runs overlapping calls once and gives every caller the same result', async () => {
    let runs = 0;
    let release: (value: number) => void = () => {};
    const shared = singleFlight(() => {
      runs += 1;
      return new Promise<number>((resolve) => {
        release = resolve;
      });
    });
    const calls = [shared(), shared(), shared()];
    release(7);
    await expect(Promise.all(calls)).resolves.toEqual([7, 7, 7]);
    expect(runs).toBe(1);
  });

  it('starts a new run after the previous one settles, including after a failure', async () => {
    let runs = 0;
    const shared = singleFlight(async () => {
      runs += 1;
      if (runs === 1) throw new Error('first fails');
      return runs;
    });
    await expect(shared()).rejects.toThrow('first fails');
    await expect(shared()).resolves.toBe(2);
  });
});
