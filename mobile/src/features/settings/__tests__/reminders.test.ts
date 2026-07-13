import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDERS,
  formatTime,
  mergeReminderSettings,
  nextMealReminderAt,
} from '../reminderModel';

describe('reminder model', () => {
  it('formats a time-of-day as a zero-padded 24h clock', () => {
    expect(formatTime({ hour: 7, minute: 0 })).toBe('07:00');
    expect(formatTime({ hour: 18, minute: 30 })).toBe('18:30');
    expect(formatTime({ hour: 0, minute: 5 })).toBe('00:05');
  });

  it('ships sensible disabled defaults (both reminders off)', () => {
    expect(DEFAULT_REMINDERS.training.enabled).toBe(false);
    expect(DEFAULT_REMINDERS.meal.enabled).toBe(false);
  });

  it('merges a stored custom time over defaults (survives reload)', () => {
    const merged = mergeReminderSettings({
      meal: { enabled: true, time: { hour: 21, minute: 15 } },
    });
    expect(merged.meal).toEqual({ enabled: true, time: { hour: 21, minute: 15 } });
    // training falls back to defaults
    expect(merged.training).toEqual(DEFAULT_REMINDERS.training);
  });

  it('upgrades a null/empty blob to defaults', () => {
    expect(mergeReminderSettings(null)).toEqual(DEFAULT_REMINDERS);
  });
});

describe('meal reminder cadence (Group H)', () => {
  const time = { hour: 20, minute: 0 };

  it('schedules today when not yet logged and the time is still ahead', () => {
    const now = new Date('2026-07-13T18:00:00'); // before 20:00 local
    const at = nextMealReminderAt(time, false, now);
    expect(at.getDate()).toBe(13);
    expect(at.getHours()).toBe(20);
  });

  it('skips to tomorrow when the user already logged today', () => {
    const now = new Date('2026-07-13T18:00:00');
    const at = nextMealReminderAt(time, true, now);
    expect(at.getDate()).toBe(14); // pushed a day — never fires on a logged day
  });

  it('skips to tomorrow when today’s time has already passed', () => {
    const now = new Date('2026-07-13T21:00:00'); // after 20:00
    const at = nextMealReminderAt(time, false, now);
    expect(at.getDate()).toBe(14);
  });
});
