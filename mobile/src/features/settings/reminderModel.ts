// Pure reminder model — no React Native / Expo imports, so it is unit-testable
// in the node test environment. reminders.ts re-exports these alongside the
// notification-scheduling logic.

export interface TimeOfDay {
  hour: number; // 0–23
  minute: number; // 0–59
}

export interface ReminderSettings {
  training: {
    enabled: boolean;
    weekdays: number[]; // 1 (Sun) – 7 (Sat), expo convention
    time: TimeOfDay;
  };
  meal: {
    enabled: boolean;
    time: TimeOfDay;
  };
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  training: { enabled: false, weekdays: [], time: { hour: 18, minute: 0 } },
  meal: { enabled: false, time: { hour: 20, minute: 0 } },
};

export const STORAGE_KEY = 'profit.reminders';
export const MEAL_REMINDER_ID = 'meal-daily';

export const WEEKDAY_LABELS: Record<number, string> = {
  2: 'Mon', 3: 'Tue', 4: 'Wed', 5: 'Thu', 6: 'Fri', 7: 'Sat', 1: 'Sun',
};

export function formatTime(t: TimeOfDay): string {
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

/**
 * Next meal-reminder fire time (Group H): today at `time` unless that's
 * already past or the user has logged today — in which case tomorrow. So the
 * reminder never lands on a day meals were already logged.
 */
export function nextMealReminderAt(
  time: TimeOfDay,
  loggedToday: boolean,
  now: Date = new Date(),
): Date {
  const target = new Date(now);
  target.setHours(time.hour, time.minute, 0, 0);
  if (loggedToday || target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

/** Merge a stored (possibly older-shaped) settings blob over the defaults. */
export function mergeReminderSettings(
  parsed: Partial<ReminderSettings> | null,
): ReminderSettings {
  if (!parsed) return DEFAULT_REMINDERS;
  return {
    training: { ...DEFAULT_REMINDERS.training, ...parsed.training },
    meal: { ...DEFAULT_REMINDERS.meal, ...parsed.meal },
  };
}
