import { describe, expect, it } from 'vitest';
import { activePlan, daysForShape, defaultLogFields, moveDay, moveHabit, targetSummary, scaleTargets, todaysDay } from '../logic';
import type { Plan, PlanDay } from '../types';
const plan: Plan = { id: 'p', name: 'Cycle', shape: 'cycle', difficulty: 'standard', active: true, updatedAt: '2026-10-08' };
const days: PlanDay[] = [0, 1, 2].map((n) => ({ id: String(n), planId: 'p', name: String(n), position: n, weekday: n + 1, restDay: n === 1 }));
describe('today in a plan', () => {
  it('starts at first day and advances only after completion', () => {
    expect(todaysDay(plan, days, null, '2026-10-08')?.id).toBe('0');
    expect(todaysDay(plan, days, { planId: 'p', dayId: '0', date: '2026-10-06' }, '2026-10-08')).toEqual(days[1]);
    expect(todaysDay(plan, days, { planId: 'p', dayId: '0', date: '2026-10-08' }, '2026-10-08')?.id).toBe('0');
    expect(todaysDay(plan, days, { planId: 'p', dayId: '2', date: '2026-10-07' }, '2026-10-08')?.id).toBe('0');
  });
  it('handles empty, deleted, foreign and future completion days', () => {
    expect(todaysDay(plan, [], null, '2026-10-08')).toBeNull();
    for (const completion of [{ planId: 'other', dayId: '1', date: '2026-10-07' }, { planId: 'p', dayId: 'deleted', date: '2026-10-07' }, { planId: 'p', dayId: '1', date: '2026-10-09' }]) expect(todaysDay(plan, days, completion, '2026-10-08')?.id).toBe('0');
    expect(todaysDay(plan, days, null, '2026-02-30')).toBeNull();
    expect(todaysDay(plan, days, null, 'bad')).toBeNull();
  });
  it('weekly follows calendar weekdays, with absent and explicit rest days', () => {
    const weekly = { ...plan, shape: 'weekly' as const };
    expect(todaysDay(weekly, days, null, '2026-10-05')?.id).toBe('0');
    expect(todaysDay(weekly, days, null, '2026-10-06')?.restDay).toBe(true);
    expect(todaysDay(weekly, days, null, '2026-10-08')).toBeNull();
    expect(todaysDay(weekly, [{ ...days[0]!, weekday: 7 }], null, '2026-10-11')?.id).toBe('0');
    expect(todaysDay(weekly, days, null, '2027-01-04')?.id).toBe('0');
  });
  it('sorts independently of input order and excludes foreign days', () => {
    expect(todaysDay(plan, [days[2]!, { ...days[0]!, planId: 'foreign' }, days[1]!, days[0]!], null, '2026-10-08')?.id).toBe('0');
  });
});
describe('targets and editing', () => {
  it('defaults match every exercise tracking type', () => {
    expect(defaultLogFields('weight_reps')).toEqual(['reps', 'weight']); expect(defaultLogFields('reps')).toEqual(['reps']);
    expect(defaultLogFields('time')).toEqual(['time']); expect(defaultLogFields('distance_time')).toEqual(['distance', 'time']);
  });
  it('scales present targets and preserves nulls without mutating originals', () => {
    const t = { targetReps: 10, targetTimeSeconds: 30, targetDistanceMetres: 100 };
    expect(scaleTargets(t, 'gentle')).toEqual({ targetReps: 8, targetTimeSeconds: 24, targetDistanceMetres: 80 });
    expect(scaleTargets(t, 'hard')).toEqual({ targetReps: 12, targetTimeSeconds: 36, targetDistanceMetres: 120 });
    expect(scaleTargets(t, 'standard')).toEqual(t);
    expect(scaleTargets({ targetReps: 1, targetTimeSeconds: null, targetDistanceMetres: null }, 'gentle')).toEqual({ targetReps: 1, targetTimeSeconds: null, targetDistanceMetres: null });
    expect(t.targetReps).toBe(10);
  });
  it('caps scaled targets to API bounds', () => {
    expect(scaleTargets({ targetReps: 1000, targetTimeSeconds: 86400, targetDistanceMetres: 1000000 }, 'hard')).toEqual({ targetReps: 1000, targetTimeSeconds: 86400, targetDistanceMetres: 1000000 });
  });
  it('moves days, retaining weekdays and respecting boundaries', () => {
    const moved = moveDay(days, '1', -1); expect(moved.map((d) => d.id)).toEqual(['1', '0', '2']);
    expect(moved.map((d) => d.position)).toEqual([0, 1, 2]); expect(moved[0]?.weekday).toBe(2);
    expect(moveDay(days, '0', -1)).toEqual(days); expect(moveDay(days, 'missing', 1)).toEqual(days); expect(days[0]?.id).toBe('0');
  });
  it('assigns weekdays on shape change and refuses more than seven', () => {
    expect(daysForShape(days, 'weekly').map((d) => d.weekday)).toEqual([1, 2, 3]);
    expect(daysForShape(days, 'cycle').map((d) => d.weekday)).toEqual([null, null, null]);
    expect(() => daysForShape([...days, ...days, ...days], 'weekly')).toThrow('seven');
  });
  it('reorders habit entries without mutating or losing duplicates', () => {
    const ids = ['a', 'b', 'a']; expect(moveHabit(ids, 1, -1)).toEqual(['b', 'a', 'a']);
    expect(moveHabit(ids, 0, -1)).toEqual(ids); expect(moveHabit(ids, 5, -1)).toEqual(ids); expect(ids).toEqual(['a', 'b', 'a']);
  });
  it('summarises scaled targets for Home', () => {
    const e = { dayId: 'd', exerciseId: 'e', position: 0, sets: 3, targetReps: 10, targetTimeSeconds: null, targetDistanceMetres: null, restSeconds: 60, logFields: ['reps'] as const };
    expect(targetSummary({ ...e, logFields: ['reps'] }, 'gentle')).toBe('3 sets · 8 reps');
    expect(targetSummary({ ...e, sets: 1, targetReps: null, logFields: ['done'] }, 'standard')).toBe('1 set');
  });
  it('picks a stable latest active plan after concurrent activation', () => {
    expect(activePlan([{ ...plan, id: 'b' }, { ...plan, id: 'a' }])?.id).toBe('a');
    expect(activePlan([plan, { ...plan, id: 'later', updatedAt: '2026-10-09' }])?.id).toBe('later');
    expect(activePlan([{ ...plan, active: false }])).toBeNull();
  });
});
