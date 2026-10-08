import type { Tracking } from '../exercises/types';
import type { Difficulty, LogField, Plan, PlanDay, Targets } from './types';
export type Completion = { planId: string; dayId: string; date: string };
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
export const orderedDays = (days: PlanDay[]) => [...days].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
export function todaysDay(plan: Plan, days: PlanDay[], lastCompleted: Completion | null, today: string): PlanDay | null {
  const ordered = orderedDays(days.filter((d) => d.planId === plan.id));
  if (!validDate(today) || !ordered.length) return null;
  if (plan.shape === 'weekly') {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
    return ordered.find((day) => day.weekday === weekday) ?? null;
  }
  if (!lastCompleted || lastCompleted.planId !== plan.id || !validDate(lastCompleted.date) || lastCompleted.date > today) return ordered[0]!;
  const index = ordered.findIndex((d) => d.id === lastCompleted.dayId);
  if (index < 0) return ordered[0]!;
  return ordered[lastCompleted.date === today ? index : (index + 1) % ordered.length]!;
}
export function defaultLogFields(tracking: Tracking): LogField[] {
  switch (tracking) {
    case 'weight_reps': return ['reps', 'weight'];
    case 'reps': return ['reps'];
    case 'time': return ['time'];
    case 'distance_time': return ['distance', 'time'];
  }
}
export const DIFFICULTY_FACTOR: Record<Difficulty, number> = { gentle: 0.8, standard: 1, hard: 1.2 };
export function scaleTargets(targets: Targets, difficulty: Difficulty): Targets {
  const scale = (value: number | null, max: number) => value === null ? null : Math.min(max, Math.max(1, Math.round(value * DIFFICULTY_FACTOR[difficulty])));
  return { targetReps: scale(targets.targetReps, 1000), targetTimeSeconds: scale(targets.targetTimeSeconds, 86400), targetDistanceMetres: scale(targets.targetDistanceMetres, 1000000) };
}
export function moveDay(days: PlanDay[], id: string, direction: -1 | 1): PlanDay[] {
  const ordered = orderedDays(days); const index = ordered.findIndex((d) => d.id === id); const next = index + direction;
  if (index < 0 || next < 0 || next >= ordered.length) return ordered;
  [ordered[index], ordered[next]] = [ordered[next]!, ordered[index]!];
  return ordered.map((day, position) => ({ ...day, position }));
}
export function activePlan(plans: Plan[]): Plan | null {
  return [...plans].filter((p) => p.active).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))[0] ?? null;
}

export function daysForShape(days: PlanDay[], shape: Plan['shape']): PlanDay[] {
  const ordered = orderedDays(days);
  if (shape === 'weekly' && ordered.length > 7) throw new Error('Weekly plans allow up to seven days. Remove extra days first.');
  return ordered.map((day, index) => ({ ...day, weekday: shape === 'weekly' ? index + 1 : null }));
}
