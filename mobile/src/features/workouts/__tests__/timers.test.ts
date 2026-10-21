import { describe, expect, it } from 'vitest';
import {
  elapsed,
  formatTimer,
  pauseTimer,
  readTimer,
  resetTimer,
  restAlertIntent,
  restDeadline,
  resumeTimer,
  sessionClock,
  startTimer,
  timerView,
  validateTimer,
  type TimerConfig,
} from '../timers';
const start = 100000;
describe('timestamp timers', () => {
  it.each([
    null,
    {},
    { mode: 'nope' },
    { mode: 'rest', seconds: 0 },
    { mode: 'AMRAP', seconds: Infinity },
    { mode: 'EMOM', rounds: 0 },
    { mode: 'interval', workSeconds: 0, restSeconds: 1, rounds: 1 },
    { mode: 'interval', workSeconds: 1, restSeconds: -1, rounds: 1 },
    { mode: 'EMOM', rounds: 1001 },
    { mode: 'stopwatch', seconds: 1 },
    { mode: 'rest', seconds: 1.5 },
  ])('rejects invalid config %j', (value) => expect(validateTimer(value)).not.toBeNull());
  it.each<TimerConfig>([
    { mode: 'rest', seconds: 60 },
    { mode: 'AMRAP', seconds: 120 },
  ])('expires %j at its exact deadline after sleeping', (config) => {
    const state = startTimer(config, start, 'a');
    const duration = (config as { seconds: number }).seconds * 1000;
    expect(timerView(state, start + duration - 1)).toMatchObject({ remainingMs: 1, done: false });
    expect(timerView(state, start + duration)).toMatchObject({ remainingMs: 0, done: true });
    expect(timerView(readTimer(JSON.parse(JSON.stringify(state)))!, start + 999999)).toMatchObject({
      remainingMs: 0,
      elapsedMs: duration,
      done: true,
    });
  });
  it('pauses and resumes without counting paused time, including repeated transitions', () => {
    const original = startTimer({ mode: 'stopwatch' }, start, 'a');
    const paused = pauseTimer(original, start + 1250);
    expect(elapsed(pauseTimer(paused, start + 9000), start + 20000)).toBe(1250);
    const resumed = resumeTimer(paused, start + 20000);
    expect(elapsed(resumeTimer(resumed, start + 21000), start + 22000)).toBe(3250);
    expect(original.accumulatedMs).toBe(0);
    expect(resetTimer(resumed, 'b')).toMatchObject({
      accumulatedMs: 0,
      runningSince: null,
      generation: 'b',
    });
    expect(() => resetTimer(resumed, 'a')).toThrow('new');
  });
  it('moves directly across interval segments and omits final rest', () => {
    const state = startTimer(
      { mode: 'interval', workSeconds: 20, restSeconds: 10, rounds: 3 },
      start,
      'a',
    );
    expect(timerView(state, start + 19999)).toMatchObject({
      round: 1,
      segment: 'work',
      remainingMs: 1,
    });
    expect(timerView(state, start + 20000)).toMatchObject({
      round: 1,
      segment: 'rest',
      remainingMs: 10000,
    });
    expect(timerView(state, start + 30000)).toMatchObject({
      round: 2,
      segment: 'work',
      remainingMs: 20000,
    });
    expect(timerView(state, start + 75000)).toMatchObject({
      round: 3,
      segment: 'work',
      remainingMs: 5000,
    });
    expect(timerView(state, start + 80000)).toMatchObject({
      round: 3,
      segment: 'done',
      done: true,
    });
  });
  it('supports zero-rest intervals, one round, Tabata and EMOM boundaries', () => {
    const zero = startTimer(
      { mode: 'interval', workSeconds: 10, restSeconds: 0, rounds: 2 },
      start,
      'a',
    );
    expect(timerView(zero, start + 10000)).toMatchObject({ round: 2, segment: 'work' });
    expect(timerView(zero, start + 20000).done).toBe(true);
    const one = startTimer(
      { mode: 'interval', workSeconds: 10, restSeconds: 10, rounds: 1 },
      start,
      'b',
    );
    expect(timerView(one, start + 10000).done).toBe(true);
    const tabata = startTimer({ mode: 'Tabata' }, start, 'c');
    expect(timerView(tabata, start + 220000)).toMatchObject({
      round: 8,
      remainingMs: 10000,
      segment: 'work',
    });
    expect(timerView(tabata, start + 230000).done).toBe(true);
    const emom = startTimer({ mode: 'EMOM', rounds: 3 }, start, 'd');
    expect(timerView(emom, start + 60000)).toMatchObject({ round: 2, remainingMs: 60000 });
    expect(timerView(emom, start + 180000).done).toBe(true);
  });
  it('keeps session clock tied to session timestamps and clamps clock rollback', () => {
    const clock = startTimer({ mode: 'session' }, start, 'a');
    expect(timerView(clock, start + 600000)).toMatchObject({
      elapsedMs: 600000,
      remainingMs: null,
      segment: 'clock',
    });
    expect(() => pauseTimer(clock, start)).toThrow('cannot');
    expect(() => resetTimer(clock, 'b')).toThrow('cannot');
    expect(() => resumeTimer(clock, start)).toThrow('finish');
    expect(sessionClock(start, start + 90000, start + 600000)).toBe(90000);
    expect(sessionClock(start, null, start - 1)).toBe(0);
    expect(elapsed(clock, start - 1)).toBe(0);
    expect(() => sessionClock(start, start - 1, start)).toThrow();
  });
  it('validates restored state and never accepts a paused or offset session clock', () => {
    const state = startTimer({ mode: 'rest', seconds: 30 }, start, 'a');
    for (const patch of [
      { accumulatedMs: -1 },
      { runningSince: NaN },
      { generation: '' },
      { config: null },
      { unexpected: 1 },
    ])
      expect(readTimer({ ...state, ...patch })).toBeNull();
    expect(readTimer({ ...state, config: { mode: 'session' }, runningSince: null })).toBeNull();
    expect(() => startTimer({ mode: 'rest', seconds: 0 }, start, 'a')).toThrow();
    expect(() => elapsed(state, NaN)).toThrow();
  });
  it('keeps matching alerts and replaces or cancels obsolete rest alerts', () => {
    const state = startTimer({ mode: 'rest', seconds: 60 }, start, 'a');
    const saved = { id: 'alert-a', at: start + 60000, generation: 'a' };
    expect(restDeadline(state, start + 20000)).toBe(saved.at);
    expect(restAlertIntent(state, saved, start + 20000)).toEqual({
      cancelId: null,
      schedule: null,
    });
    expect(restAlertIntent(state, null, start)).toEqual({
      cancelId: null,
      schedule: { at: saved.at, generation: 'a' },
    });
    const replacement = startTimer({ mode: 'rest', seconds: 30 }, start + 10000, 'b');
    expect(restAlertIntent(replacement, saved, start + 10000)).toEqual({
      cancelId: saved.id,
      schedule: { at: start + 40000, generation: 'b' },
    });
    for (const timer of [
      null,
      pauseTimer(state, start + 1000),
      startTimer({ mode: 'AMRAP', seconds: 60 }, start, 'c'),
    ])
      expect(restAlertIntent(timer, saved, start)).toEqual({ cancelId: saved.id, schedule: null });
    expect(restAlertIntent(state, saved, saved.at)).toEqual({ cancelId: saved.id, schedule: null });
  });
  it('formats elapsed down and countdown up without showing zero too early', () => {
    expect(formatTimer(59999)).toBe('0:59');
    expect(formatTimer(59999, true)).toBe('1:00');
    expect(formatTimer(1, true)).toBe('0:01');
    expect(formatTimer(3661000)).toBe('1:01:01');
    expect(formatTimer(-1)).toBe('0:00');
    expect(formatTimer(NaN)).toBe('0:00');
  });
});
