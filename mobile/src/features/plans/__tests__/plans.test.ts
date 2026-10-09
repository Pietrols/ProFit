import { describe, expect, it } from 'vitest';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { syncedCollections } from '../../sync/collections';
import { createSyncEngine } from '../../sync/engine';
import { fakeSyncServer } from '../../sync/__tests__/fakeSyncServer';
import { deleteDay, deletePlan, deletePlanExercise, habitId, listDays, listHabit, listPlanExercises, listPlans, saveDay, saveHabit, savePlan, savePlanExercise, reorderDays, validatePlanExercise } from '../plans';
import type { PlanExerciseInput } from '../types';
const user = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const at = (n: number) => new Date(Date.UTC(2026, 9, 8, 9, n));
const input = { name: 'Cycle', shape: 'cycle' as const, difficulty: 'standard' as const, active: true };
const exercise = (dayId: string): PlanExerciseInput => ({ dayId, exerciseId: 'Plank', position: 0, sets: 3, targetReps: null, targetTimeSeconds: 30, targetDistanceMetres: null, restSeconds: 60, logFields: ['time', 'RPE', 'notes'] });
async function fixture() {
  const db = await testDatabase(); const planId = await savePlan(db, user, input, at(0));
  const dayId = await saveDay(db, user, { planId, name: 'A', position: 0, weekday: null, restDay: false }, at(0));
  const exerciseId = await savePlanExercise(db, user, exercise(dayId), at(0));
  return { db, planId, dayId, exerciseId };
}
describe('plans on SQLite', () => {
  it('creates, lists and edits all records', async () => {
    const { db, planId, dayId, exerciseId } = await fixture();
    expect(await listPlans(db, user)).toMatchObject([{ ...input, id: planId }]);
    expect(await listDays(db, user, planId)).toMatchObject([{ id: dayId, name: 'A', restDay: false }]);
    expect(await listPlanExercises(db, user, dayId)).toEqual([{ ...exercise(dayId), id: exerciseId }]);
    await savePlanExercise(db, user, { ...exercise(dayId), sets: 4 }, at(1), exerciseId);
    expect(await listPlanExercises(db, user, dayId)).toMatchObject([{ sets: 4 }]);
    await saveDay(db, user, { planId, name: 'Edited', position: 0, weekday: null, restDay: false }, at(2), dayId);
    expect(await listDays(db, user, planId)).toMatchObject([{ name: 'Edited' }]);
  });
  it('activating a plan deactivates the previous one', async () => {
    const { db } = await fixture(); await savePlan(db, user, { ...input, name: 'Second' }, at(1));
    const rows = await listPlans(db, user); expect(rows.filter((p) => p.active).map((p) => p.name)).toEqual(['Second']);
  });
  it('deletes children as dirty tombstones', async () => {
    const { db, planId, dayId } = await fixture(); await deleteDay(db, user, dayId, at(1));
    expect(await listDays(db, user, planId)).toEqual([]); expect(await listPlanExercises(db, user, dayId)).toEqual([]);
    expect(await db.first('SELECT dirty, deleted_at FROM plan_exercises')).toEqual({ dirty: 1, deleted_at: at(1).toISOString() });
    await deletePlan(db, user, planId, at(2)); expect(await listPlans(db, user)).toEqual([]);
    await expect(saveDay(db, user, { planId, name: 'B', position: 0, weekday: null, restDay: false }, at(3))).rejects.toThrow();
  });
  it('removes one exercise without deleting its day', async () => {
    const { db, planId, dayId, exerciseId } = await fixture(); await deletePlanExercise(db, user, exerciseId, at(1));
    expect(await listPlanExercises(db, user, dayId)).toEqual([]); expect(await listDays(db, user, planId)).toHaveLength(1);
  });
  it('scopes reads, parents and deletes to the signed-in user', async () => {
    const { db, planId, dayId } = await fixture();
    expect(await listPlans(db, other)).toEqual([]); expect(await listDays(db, other, planId)).toEqual([]);
    expect(await listPlanExercises(db, other, dayId)).toEqual([]);
    await deletePlan(db, other, planId, at(1)); expect(await listPlans(db, user)).toHaveLength(1);
    await expect(savePlanExercise(db, other, exercise(dayId), at(1))).rejects.toThrow();
    await expect(savePlan(db, other, input, at(1), planId)).rejects.toThrow();
  });
  it('checks target bounds and selected log fields', async () => {
    const { db, dayId } = await fixture();
    expect(validatePlanExercise(exercise(dayId))).toBeNull();
    for (const patch of [{ sets: 0 }, { targetTimeSeconds: NaN }, { logFields: [] }, { logFields: ['time', 'time'] }]) {
      const bad = { ...exercise(dayId), ...patch } as PlanExerciseInput;
      expect(validatePlanExercise(bad)).not.toBeNull(); await expect(savePlanExercise(db, user, bad, at(1))).rejects.toThrow();
    }
    expect(await listPlanExercises(db, user, dayId)).toHaveLength(1);
  });
  it('weekly days require a unique weekday and rest days reject exercises', async () => {
    const db = await testDatabase(); const planId = await savePlan(db, user, { ...input, shape: 'weekly' }, at(0));
    const day = { planId, position: 0, name: 'Rest', weekday: 1, restDay: true };
    const dayId = await saveDay(db, user, day, at(0));
    await expect(saveDay(db, user, day, at(1))).rejects.toThrow('already');
    await expect(saveDay(db, user, { ...day, weekday: null }, at(1))).rejects.toThrow('weekday');
    await expect(savePlanExercise(db, user, exercise(dayId), at(1))).rejects.toThrow('training day');
  });
  it('converts shape without losing days and reorders atomically', async () => {
    const { db, planId, dayId } = await fixture();
    const second = await saveDay(db, user, { planId, name: 'B', position: 1, weekday: null, restDay: false }, at(1));
    await savePlan(db, user, { ...input, shape: 'weekly' }, at(2), planId);
    const days = await listDays(db, user, planId); expect(days.map((d) => d.weekday)).toEqual([1, 2]);
    await reorderDays(db, user, planId, [{ ...days[1]!, position: 0 }, { ...days[0]!, position: 1 }], at(3));
    expect((await listDays(db, user, planId)).map((d) => d.id)).toEqual([second, dayId]);
    await savePlan(db, user, input, at(4), planId);
    expect((await listDays(db, user, planId)).map((d) => d.weekday)).toEqual([null, null]);
  });
  it('stores one habit per account and clearing is a synced edit', async () => {
    const db = await testDatabase(); await saveHabit(db, user, ['Plank'], at(0)); await saveHabit(db, user, ['Pushups', 'Plank'], at(1));
    expect(await listHabit(db, user)).toEqual(['Pushups', 'Plank']); expect(await listHabit(db, other)).toEqual([]);
    expect(await db.first('SELECT id FROM daily_habit')).toEqual({ id: habitId(user) });
    await saveHabit(db, user, [], at(2)); expect(await listHabit(db, user)).toEqual([]);
    expect(await db.first('SELECT COUNT(*) AS n, dirty FROM daily_habit')).toEqual({ n: 1, dirty: 1 });
  });
  it('syncs boolean and array fields to a second phone, then a deletion', async () => {
    const { db: a, planId, dayId } = await fixture(); const b = await testDatabase(); const server = fakeSyncServer();
    const ea = createSyncEngine({ db: a, api: server.clientFor(user), collections: syncedCollections });
    const eb = createSyncEngine({ db: b, api: server.clientFor(user), collections: syncedCollections });
    await ea.setUser(user); await eb.setUser(user); await saveHabit(a, user, ['Plank'], at(1));
    server.state.online = false; await ea.sync(); expect(await listPlans(a, user)).toHaveLength(1);
    server.state.online = true; await ea.sync(); await eb.sync();
    expect(await listPlans(b, user)).toMatchObject([{ active: true }]);
    expect(await listDays(b, user, planId)).toMatchObject([{ restDay: false }]);
    expect(await listPlanExercises(b, user, dayId)).toMatchObject([{ logFields: ['time', 'RPE', 'notes'] }]);
    expect(await listHabit(b, user)).toEqual(['Plank']);
    await deletePlan(a, user, planId, at(2)); await ea.sync(); await eb.sync();
    expect(await listPlans(b, user)).toEqual([]); expect(await listPlanExercises(b, user, dayId)).toEqual([]);
  });
});
