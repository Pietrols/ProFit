import type { Database, Sql } from '../../lib/db/database';
import { randomId } from '../../lib/randomId';
import { uuidv5 } from '../../lib/uuid';
import { LOG_FIELDS, type DayInput, type Plan, type PlanDay, type PlanExercise, type PlanExerciseInput, type PlanInput } from './types';

const exerciseId = (id: string) => /^[A-Za-z0-9_-]{1,100}$/.test(id);
const uuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const integer = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
export function validatePlan(input: PlanInput): string | null {
  if (!input.name.trim() || input.name.trim().length > 80) return 'Give the plan a name of 1 to 80 characters.';
  if (!['cycle', 'weekly'].includes(input.shape) || !['gentle', 'standard', 'hard'].includes(input.difficulty) || typeof input.active !== 'boolean') return 'Choose a plan shape and difficulty.';
  return null;
}
export function validateDay(input: DayInput): string | null {
  if (!uuid(input.planId) || !integer(input.position, 0, 10000)) return 'Choose a plan and day position.';
  if (!input.name.trim() || input.name.trim().length > 80) return 'Give the day a name of 1 to 80 characters.';
  if (input.weekday !== null && !integer(input.weekday, 1, 7)) return 'Choose Monday to Sunday.';
  if (typeof input.restDay !== 'boolean') return 'Choose whether this is a rest day.';
  return null;
}
export function validatePlanExercise(input: PlanExerciseInput): string | null {
  if (!uuid(input.dayId) || !exerciseId(input.exerciseId) || !integer(input.position, 0, 10000)) return 'Choose an exercise and day.';
  if (!integer(input.sets, 1, 100) || !integer(input.restSeconds, 0, 3600)) return 'Sets must be 1 to 100 and rest 0 to 3600 seconds.';
  if (input.targetReps !== null && !integer(input.targetReps, 1, 1000)) return 'Reps must be 1 to 1000.';
  if (input.targetTimeSeconds !== null && !integer(input.targetTimeSeconds, 1, 86400)) return 'Time must be 1 to 86400 seconds.';
  if (input.targetDistanceMetres !== null && (!Number.isFinite(input.targetDistanceMetres) || input.targetDistanceMetres < 1 || input.targetDistanceMetres > 1000000)) return 'Distance must be 1 to 1000000 metres.';
  if (!input.logFields.length || input.logFields.some((f) => !LOG_FIELDS.includes(f)) || new Set(input.logFields).size !== input.logFields.length) return 'Choose at least one unique log field.';
  return null;
}
export function validateHabit(ids: string[]): string | null {
  return ids.length > 100 || ids.some((id) => !exerciseId(id)) ? 'Choose up to 100 exercises from the library.' : null;
}
function check(error: string | null) { if (error) throw new Error(error); }

async function upsert(db: Sql, table: string, userId: string, id: string, values: Record<string, string | number | null>, now: Date) {
  const fields = Object.keys(values);
  const result = await db.run(`INSERT INTO ${table} (id, user_id, ${fields.join(', ')}, updated_at, deleted_at, dirty)
    VALUES (?, ?, ${fields.map(() => '?').join(', ')}, ?, NULL, 1)
    ON CONFLICT(id) DO UPDATE SET ${fields.map((f) => `${f} = excluded.${f}`).join(', ')}, updated_at = excluded.updated_at, dirty = 1
    WHERE ${table}.user_id = excluded.user_id AND ${table}.deleted_at IS NULL`, [id, userId, ...Object.values(values), now.toISOString()]);
  if (!result.changes) throw new Error('This item is no longer available.');
}
async function owner(db: Sql, table: string, userId: string, id: string) {
  if (!await db.first(`SELECT id FROM ${table} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [id, userId])) throw new Error('This item is no longer available.');
}
export async function savePlan(db: Database, userId: string, input: PlanInput, now: Date, id = randomId()): Promise<string> {
  check(validatePlan(input));
  await db.transaction(async (tx) => {
    const existing = await tx.first<{ user_id: string; deleted_at: string | null }>('SELECT user_id, deleted_at FROM plans WHERE id = ?', [id]);
    if (existing && (existing.user_id !== userId || existing.deleted_at)) throw new Error('This plan is no longer available.');
    if (input.active) await tx.run('UPDATE plans SET active = 0, updated_at = ?, dirty = 1 WHERE user_id = ? AND id != ? AND active = 1 AND deleted_at IS NULL', [now.toISOString(), userId, id]);
    await upsert(tx, 'plans', userId, id, { name: input.name.trim(), shape: input.shape, difficulty: input.difficulty, active: input.active ? 1 : 0 }, now);
  }); return id;
}
export async function listPlans(db: Sql, userId: string): Promise<Plan[]> {
  const rows = await db.all<Omit<Plan, 'active'> & { active: number }>('SELECT id, name, shape, difficulty, active, updated_at AS updatedAt FROM plans WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, id', [userId]);
  return rows.map((row) => ({ ...row, active: !!row.active }));
}
export async function saveDay(db: Database, userId: string, input: DayInput, now: Date, id = randomId()): Promise<string> {
  check(validateDay(input));
  await db.transaction(async (tx) => {
    await owner(tx, 'plans', userId, input.planId);
    const plan = await tx.first<{ shape: string }>('SELECT shape FROM plans WHERE id = ? AND user_id = ?', [input.planId, userId]);
    if (plan?.shape === 'weekly') {
      if (input.weekday === null) throw new Error('Choose a weekday for a weekly day.');
      if (await tx.first('SELECT id FROM plan_days WHERE plan_id = ? AND user_id = ? AND weekday = ? AND id != ? AND deleted_at IS NULL', [input.planId, userId, input.weekday, id])) throw new Error('That weekday already has a day.');
    }
    await upsert(tx, 'plan_days', userId, id, { plan_id: input.planId, position: input.position, weekday: plan?.shape === 'weekly' ? input.weekday : null, name: input.name.trim(), rest_day: input.restDay ? 1 : 0 }, now);
  }); return id;
}
export async function listDays(db: Sql, userId: string, planId: string): Promise<PlanDay[]> {
  const rows = await db.all<Omit<PlanDay, 'restDay'> & { restDay: number }>(`SELECT d.id, d.plan_id AS planId, d.position, d.weekday, d.name, d.rest_day AS restDay FROM plan_days d
    JOIN plans p ON p.id = d.plan_id AND p.user_id = d.user_id WHERE d.user_id = ? AND p.id = ? AND p.deleted_at IS NULL AND d.deleted_at IS NULL ORDER BY d.position, d.id`, [userId, planId]);
  return rows.map((row) => ({ ...row, restDay: !!row.restDay }));
}
export async function savePlanExercise(db: Database, userId: string, input: PlanExerciseInput, now: Date, id = randomId()): Promise<string> {
  check(validatePlanExercise(input));
  await db.transaction(async (tx) => {
    const day = await tx.first<{ rest_day: number }>(`SELECT d.rest_day FROM plan_days d JOIN plans p ON p.id = d.plan_id AND p.user_id = d.user_id WHERE d.id = ? AND d.user_id = ? AND d.deleted_at IS NULL AND p.deleted_at IS NULL`, [input.dayId, userId]);
    if (!day || day.rest_day) throw new Error('Choose a training day that is still available.');
    await upsert(tx, 'plan_exercises', userId, id, { day_id: input.dayId, exercise_id: input.exerciseId, position: input.position, sets: input.sets, target_reps: input.targetReps, target_time_seconds: input.targetTimeSeconds, target_distance_metres: input.targetDistanceMetres, rest_seconds: input.restSeconds, log_fields: JSON.stringify(input.logFields) }, now);
  }); return id;
}
export async function listPlanExercises(db: Sql, userId: string, dayId: string): Promise<PlanExercise[]> {
  const rows = await db.all<Omit<PlanExercise, 'logFields'> & { logFields: string }>(`SELECT e.id, e.day_id AS dayId, e.exercise_id AS exerciseId, e.position, e.sets, e.target_reps AS targetReps,
    e.target_time_seconds AS targetTimeSeconds, e.target_distance_metres AS targetDistanceMetres, e.rest_seconds AS restSeconds, e.log_fields AS logFields
    FROM plan_exercises e JOIN plan_days d ON d.id = e.day_id AND d.user_id = e.user_id JOIN plans p ON p.id = d.plan_id AND p.user_id = d.user_id
    WHERE e.user_id = ? AND e.day_id = ? AND e.deleted_at IS NULL AND d.deleted_at IS NULL AND p.deleted_at IS NULL ORDER BY e.position, e.id`, [userId, dayId]);
  return rows.map((row) => ({ ...row, logFields: JSON.parse(row.logFields) as PlanExercise['logFields'] }));
}
async function tombstone(tx: Sql, table: string, userId: string, id: string, now: Date) {
  await tx.run(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [now.toISOString(), now.toISOString(), id, userId]);
}
export async function deletePlanExercise(db: Sql, userId: string, id: string, now: Date) { await tombstone(db, 'plan_exercises', userId, id, now); }
async function deleteDayRows(tx: Sql, userId: string, id: string, now: Date) {
  const rows = await tx.all<{ id: string }>('SELECT id FROM plan_exercises WHERE day_id = ? AND user_id = ?', [id, userId]);
  for (const row of rows) await tombstone(tx, 'plan_exercises', userId, row.id, now);
  await tombstone(tx, 'plan_days', userId, id, now);
}
export async function deleteDay(db: Database, userId: string, id: string, now: Date) { await db.transaction((tx) => deleteDayRows(tx, userId, id, now)); }
export async function deletePlan(db: Database, userId: string, id: string, now: Date) {
  await db.transaction(async (tx) => {
    const days = await tx.all<{ id: string }>('SELECT id FROM plan_days WHERE plan_id = ? AND user_id = ?', [id, userId]);
    for (const day of days) await deleteDayRows(tx, userId, day.id, now);
    await tombstone(tx, 'plans', userId, id, now);
  });
}
const HABIT_NAMESPACE = '3a6cd80b-e825-4a7e-a865-a6f9c90841f2';
export const habitId = (userId: string) => uuidv5(userId, HABIT_NAMESPACE);
export async function saveHabit(db: Sql, userId: string, ids: string[], now: Date) {
  check(validateHabit(ids)); await upsert(db, 'daily_habit', userId, habitId(userId), { exercise_ids: JSON.stringify(ids) }, now);
}
export async function listHabit(db: Sql, userId: string): Promise<string[]> {
  const row = await db.first<{ exercise_ids: string }>('SELECT exercise_ids FROM daily_habit WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, id LIMIT 1', [userId]);
  return row ? JSON.parse(row.exercise_ids) as string[] : [];
}
