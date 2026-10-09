import { describe, expect, it } from 'vitest';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { builtInExercise } from '../../exercises/library';
import { deleteDay, listDays, listPlanExercises, listPlans, savePlan } from '../plans';
import { copyStarter, STARTER_PLANS } from '../starters';
const user = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-10-08T10:00:00Z');
describe('ProFit starter plans', () => {
  it('every exercise id exists in the bundled library', () => {
    expect(STARTER_PLANS).toHaveLength(4);
    for (const starter of STARTER_PLANS) for (const day of starter.days) for (const exercise of day.exercises) expect(builtInExercise(exercise.exerciseId), `${starter.name}/${day.name}/${exercise.exerciseId}`).not.toBeNull();
  });
  it('makes independent editable copies with fresh ids and correct log fields', async () => {
    const db = await testDatabase(); const starter = STARTER_PLANS[0]!;
    const a = await copyStarter(db, user, starter, now); const b = await copyStarter(db, user, starter, now);
    expect(a).not.toBe(b); const daysA = await listDays(db, user, a); const daysB = await listDays(db, user, b);
    expect(daysA).toHaveLength(3); expect(daysB).toHaveLength(3); expect(daysA[0]!.id).not.toBe(daysB[0]!.id);
    const exercises = await listPlanExercises(db, user, daysA[0]!.id);
    expect(exercises[0]).toMatchObject({ targetReps: 10, logFields: ['reps'] });
    expect(exercises.at(-1)).toMatchObject({ targetTimeSeconds: 20, logFields: ['time'] });
    await deleteDay(db, user, daysA[0]!.id, now); expect(await listDays(db, user, b)).toHaveLength(3);
    await savePlan(db, user, { name: 'My edited plan', shape: 'cycle', difficulty: 'hard', active: false }, now, a);
    expect(starter.name).toBe('Beginner full body'); expect((await listPlans(db, user)).find((p) => p.id === b)?.name).toBe(starter.name);
  });
  it('rolls back a malformed starter without deactivating a previous plan', async () => {
    const db = await testDatabase(); await copyStarter(db, user, STARTER_PLANS[0]!, now);
    await expect(copyStarter(db, user, { ...STARTER_PLANS[0]!, days: [{ name: 'Bad', exercises: [{ exerciseId: 'Plank', sets: 0 }] }] }, now)).rejects.toThrow();
    expect(await listPlans(db, user)).toHaveLength(1); expect((await listPlans(db, user))[0]?.active).toBe(true);
    await expect(copyStarter(db, user, { ...STARTER_PLANS[0]!, days: [{ name: 'Bad', exercises: [{ exerciseId: 'missing', sets: 1 }] }] }, now)).rejects.toThrow('missing');
  });
});
