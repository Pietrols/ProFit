// AUDIT M3: recovery-aware day suggestion.
import { describe, expect, it } from 'vitest';
import { Plan } from '../../../data/planRepo';
import { suggestDay } from '../suggestDay';

const plan = {
  id: 'p1',
  name: 'Plan',
  context: 'home',
  days: [
    { id: 'daily', dayIndex: 0, name: 'Daily', category: 'bodybuilding', isDaily: true, exercises: [] },
    { id: 'a', dayIndex: 1, name: 'Full Body A', category: 'bodybuilding', exercises: [] },
    { id: 'b', dayIndex: 2, name: 'Full Body B', category: 'bodybuilding', exercises: [] },
    { id: 'c', dayIndex: 3, name: 'Intervals', category: 'cardio', exercises: [] },
  ],
} as unknown as Plan;

const now = new Date('2026-07-15T10:00:00Z');
const fresh = { id: 'c1', soreness: 2, sleepQuality: 4, loggedAt: '2026-07-15T08:00:00Z' };
const wrecked = { id: 'c2', soreness: 5, sleepQuality: 2, loggedAt: '2026-07-15T08:00:00Z' };
const staleWrecked = { ...wrecked, loggedAt: '2026-07-10T08:00:00Z' };

describe('suggestDay', () => {
  it('rotates to the least-recently-trained split day (never ignores daily routine)', () => {
    const s = suggestDay(
      plan,
      [
        { planDayId: 'a', startedAt: '2026-07-14T10:00:00Z' },
        { planDayId: 'b', startedAt: '2026-07-12T10:00:00Z' },
        { planDayId: 'c', startedAt: '2026-07-13T10:00:00Z' },
      ],
      fresh,
      now,
    );
    expect(s?.dayId).toBe('b');
    expect(s?.easier).toBe(false);
  });

  it('a never-trained day wins the rotation', () => {
    const s = suggestDay(plan, [{ planDayId: 'a', startedAt: '2026-07-14T10:00:00Z' }], null, now);
    expect(s?.dayId).toBe('b'); // first never-trained in day order
  });

  it('a rough recent check-in steers to the cardio day', () => {
    const s = suggestDay(
      plan,
      [
        { planDayId: 'c', startedAt: '2026-07-14T10:00:00Z' },
        { planDayId: 'b', startedAt: '2026-07-13T10:00:00Z' },
      ],
      wrecked,
      now,
    );
    expect(s?.dayId).toBe('c');
    expect(s?.reason).toMatch(/cardio/i);
  });

  it('rough check-in with no alternative recommends the easier version', () => {
    const noCardio = {
      ...plan,
      days: plan.days.filter((d) => d.category !== 'cardio'),
    } as Plan;
    const s = suggestDay(noCardio, [], wrecked, now);
    expect(s?.easier).toBe(true);
  });

  it('stale check-ins (>36h) are ignored', () => {
    const s = suggestDay(plan, [], staleWrecked, now);
    expect(s?.easier).toBe(false);
    expect(s?.reason).toMatch(/next up/i);
  });
});
