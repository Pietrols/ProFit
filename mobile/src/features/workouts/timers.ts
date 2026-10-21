export type TimerConfig =
  | { mode: 'rest'; seconds: number }
  | { mode: 'AMRAP'; seconds: number }
  | { mode: 'interval'; workSeconds: number; restSeconds: number; rounds: number }
  | { mode: 'EMOM'; rounds: number }
  | { mode: 'Tabata' }
  | { mode: 'stopwatch' }
  | { mode: 'session' };
export type TimerState = {
  config: TimerConfig;
  accumulatedMs: number;
  runningSince: number | null;
  generation: string;
};
export type TimerView = {
  elapsedMs: number;
  remainingMs: number | null;
  round: number | null;
  segment: 'work' | 'rest' | 'clock' | 'done';
  done: boolean;
};
export type SavedAlert = { id: string; generation: string; at: number };
const whole = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const time = (v: unknown): v is number => whole(v, 0, 8640000000000000);
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateTimer(config: unknown): string | null {
  if (!object(config)) return 'Choose a timer.';
  let fields: string[];
  switch (config.mode) {
    case 'rest':
    case 'AMRAP':
      if (!whole(config.seconds, 1, 86400)) return 'Duration must be 1 to 86400 seconds.';
      fields = ['mode', 'seconds'];
      break;
    case 'interval':
      if (
        !whole(config.workSeconds, 1, 86400) ||
        !whole(config.restSeconds, 0, 86400) ||
        !whole(config.rounds, 1, 1000)
      )
        return 'Check work, rest and rounds.';
      fields = ['mode', 'workSeconds', 'restSeconds', 'rounds'];
      break;
    case 'EMOM':
      if (!whole(config.rounds, 1, 1000)) return 'Rounds must be 1 to 1000.';
      fields = ['mode', 'rounds'];
      break;
    case 'Tabata':
    case 'stopwatch':
    case 'session':
      fields = ['mode'];
      break;
    default:
      return 'Choose a timer mode.';
  }
  return Object.keys(config).every((key) => fields.includes(key))
    ? null
    : 'Unexpected timer setting.';
}
export function readTimer(value: unknown): TimerState | null {
  if (
    !object(value) ||
    validateTimer(value.config) ||
    !time(value.accumulatedMs) ||
    (value.runningSince !== null && !time(value.runningSince)) ||
    typeof value.generation !== 'string' ||
    !value.generation ||
    Object.keys(value).some(
      (key) => !['config', 'accumulatedMs', 'runningSince', 'generation'].includes(key),
    )
  )
    return null;
  if (
    (value.config as TimerConfig).mode === 'session' &&
    (value.runningSince === null || value.accumulatedMs !== 0)
  )
    return null;
  return {
    config: { ...(value.config as TimerConfig) },
    accumulatedMs: value.accumulatedMs,
    runningSince: value.runningSince as number | null,
    generation: value.generation,
  };
}
export function startTimer(config: TimerConfig, now: number, generation: string): TimerState {
  const state = readTimer({ config, accumulatedMs: 0, runningSince: now, generation });
  if (!state) throw new Error('Invalid timer settings or start time.');
  return state;
}
export function elapsed(timer: TimerState, now: number): number {
  if (!time(now) || !readTimer(timer)) throw new Error('Invalid timer state or time.');
  return (
    timer.accumulatedMs + (timer.runningSince === null ? 0 : Math.max(0, now - timer.runningSince))
  );
}
export function pauseTimer(timer: TimerState, now: number): TimerState {
  if (timer.config.mode === 'session') throw new Error('The session clock cannot be paused.');
  return { ...timer, accumulatedMs: elapsed(timer, now), runningSince: null };
}
export function resumeTimer(timer: TimerState, now: number): TimerState {
  elapsed(timer, now);
  if (timer.config.mode === 'session') throw new Error('The session clock runs until finish.');
  return timer.runningSince === null ? { ...timer, runningSince: now } : { ...timer };
}
export function resetTimer(timer: TimerState, generation: string): TimerState {
  if (timer.config.mode === 'session') throw new Error('The session clock cannot be reset.');
  if (!generation || generation === timer.generation || !readTimer(timer))
    throw new Error('Reset requires a new timer generation.');
  return {
    ...timer,
    config: { ...timer.config },
    accumulatedMs: 0,
    runningSince: null,
    generation,
  };
}
export function timerView(timer: TimerState, now: number): TimerView {
  const ms = elapsed(timer, now);
  const c = timer.config;
  if (c.mode === 'stopwatch' || c.mode === 'session')
    return { elapsedMs: ms, remainingMs: null, round: null, segment: 'clock', done: false };
  if (c.mode === 'rest' || c.mode === 'AMRAP') {
    const total = c.seconds * 1000;
    const done = ms >= total;
    return {
      elapsedMs: Math.min(ms, total),
      remainingMs: Math.max(0, total - ms),
      round: null,
      segment: done ? 'done' : c.mode === 'rest' ? 'rest' : 'work',
      done,
    };
  }
  const work = (c.mode === 'Tabata' ? 20 : c.mode === 'EMOM' ? 60 : c.workSeconds) * 1000;
  const rest = (c.mode === 'Tabata' ? 10 : c.mode === 'EMOM' ? 0 : c.restSeconds) * 1000;
  const rounds = c.mode === 'Tabata' ? 8 : c.rounds;
  const total = rounds * work + (rounds - 1) * rest;
  if (ms >= total)
    return { elapsedMs: total, remainingMs: 0, round: rounds, segment: 'done', done: true };
  const round = Math.floor(ms / (work + rest));
  const within = ms % (work + rest);
  return {
    elapsedMs: ms,
    remainingMs: within < work ? work - within : work + rest - within,
    round: round + 1,
    segment: within < work ? 'work' : 'rest',
    done: false,
  };
}
export function sessionClock(startedAt: number, endedAt: number | null, now: number): number {
  if (
    !time(startedAt) ||
    !time(now) ||
    (endedAt !== null && (!time(endedAt) || endedAt < startedAt))
  )
    throw new Error('Invalid session times.');
  return Math.max(0, (endedAt ?? now) - startedAt);
}
export function restDeadline(timer: TimerState | null, now: number): number | null {
  if (!timer || timer.config.mode !== 'rest' || timer.runningSince === null) return null;
  const view = timerView(timer, now);
  return view.done ? null : now + view.remainingMs!;
}
export function restAlertIntent(
  timer: TimerState | null,
  saved: SavedAlert | null,
  now: number,
): { cancelId: string | null; schedule: Omit<SavedAlert, 'id'> | null } {
  const at = restDeadline(timer, now);
  if (at !== null && saved?.at === at && saved.generation === timer!.generation)
    return { cancelId: null, schedule: null };
  return {
    cancelId: saved?.id ?? null,
    schedule: at === null ? null : { at, generation: timer!.generation },
  };
}
export function formatTimer(ms: number, countdown = false): string {
  if (!Number.isFinite(ms)) return '0:00';
  const seconds = Math.max(0, countdown ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return minutes < 60
    ? `${minutes}:${rest}`
    : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}`;
}
