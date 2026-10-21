import { readTimer, type TimerState } from './timers';
export type WorkoutTimerStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
const key = (user: string, session: string) =>
  `workout-timer:${encodeURIComponent(user)}:${encodeURIComponent(session)}`;
// A set can commit just before a crash prevents its replacement timer from being saved.
export function timerAfterLogs(
  timer: TimerState | null,
  loggedAt: readonly string[],
  eligibleSetIds?: readonly string[],
): TimerState | null {
  if (timer?.sourceSetId && eligibleSetIds && !eligibleSetIds.includes(timer.sourceSetId))
    return null;
  if (
    timer?.runningSince !== null &&
    timer &&
    loggedAt.some((at) => Date.parse(at) > timer.runningSince!)
  )
    return null;
  return timer;
}
export async function loadWorkoutTimer(
  store: WorkoutTimerStorage,
  user: string,
  session: string,
): Promise<TimerState | null> {
  const value = await store.getItem(key(user, session));
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('The saved timer could not be read. Reset the timer to continue.');
  }
  const timer = readTimer(parsed);
  if (!timer) throw new Error('The saved timer is invalid. Reset the timer to continue.');
  return timer;
}
export async function saveWorkoutTimer(
  store: WorkoutTimerStorage,
  user: string,
  session: string,
  timer: TimerState | null,
): Promise<void> {
  if (timer === null) return store.removeItem(key(user, session));
  if (!readTimer(timer)) throw new Error('Invalid timer state.');
  await store.setItem(key(user, session), JSON.stringify(timer));
}
