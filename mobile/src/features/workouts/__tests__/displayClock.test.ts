import { afterEach, expect, it, vi } from 'vitest';
import { startDisplayClock } from '../displayClock';
import { pauseTimer, startTimer, timerView } from '../timers';

afterEach(() => vi.useRealTimers());

it('stops display updates while hidden and immediately catches up after ten minutes asleep', () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let foreground = true;
  let changed!: () => void;
  let queued!: () => void;
  const removed = vi.fn();
  const publish = vi.fn();
  const timer = startTimer({ mode: 'rest', seconds: 1200 }, 0, 'sleep');
  const paused = pauseTimer(timer, 300000);
  const stop = startDisplayClock(
    {
      now: Date.now,
      foreground: () => foreground,
      subscribe(listener) {
        changed = listener;
        return removed;
      },
      every(tick, delay) {
        queued = tick;
        const handle = setInterval(tick, delay);
        return () => clearInterval(handle);
      },
    },
    publish,
  );
  vi.advanceTimersByTime(60000);
  expect(publish).toHaveBeenCalledTimes(241);
  foreground = false;
  changed();
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(600000);
  queued();
  expect(publish).toHaveBeenCalledTimes(241);
  foreground = true;
  changed();
  const now = publish.mock.lastCall![0] as number;
  expect(now).toBe(660000);
  expect(timerView(timer, now).remainingMs).toBe(540000);
  expect(timerView(paused, now).remainingMs).toBe(900000);
  stop();
  queued();
  changed();
  expect(vi.getTimerCount()).toBe(0);
  expect(publish).toHaveBeenCalledTimes(242);
  expect(removed).toHaveBeenCalledOnce();
});
