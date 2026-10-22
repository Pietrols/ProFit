import { expect, it } from 'vitest';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { draftResultRevision, recoverSetDraft } from '../draftRecord';
import { createWorkoutDraftStore } from '../draftStorage';
import { adjustSession } from '../sessionAdjustments';
import { removeLoggedSet } from '../setCorrections';
import { logStableSet } from '../stableLogging';
import { readStructuredWorkout } from '../structureReads';
import { chooseWorkoutSlot } from '../workoutSelection';
import { parseSetDraft } from '../workoutForm';
import { updateSession } from '../workouts';
import { at, other, session, sessionId, user } from './fixtures';

it('recovers independent drafts after selection, reorder and a crash between performance and cleanup', async () => {
  const db = await testDatabase();
  const original = session();
  original.snapshot.exercises.push({
    ...original.snapshot.exercises[0]!,
    exerciseId: 'Row',
    name: 'Row',
  });
  await db.run(
    `INSERT INTO workout_sessions VALUES (?, ?, ?, ?, ?, ?, NULL, 'active', '', 0, ?, ?, NULL, 1)`,
    [
      sessionId,
      user,
      user,
      other,
      original.localDate,
      original.startedAt,
      JSON.stringify(original.snapshot),
      original.startedAt,
    ],
  );
  const data = new Map<string, string>();
  const storage = {
    async getItem(key: string) {
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      data.set(key, value);
    },
    async removeItem(key: string) {
      data.delete(key);
    },
  };
  const drafts = createWorkoutDraftStore(storage);
  const read = async () => (await readStructuredWorkout(db, user, sessionId))!;
  let detail = await read();
  const bench = detail.itemView.items[0]!;
  const row = detail.itemView.items[1]!;
  const selected = chooseWorkoutSlot(detail, bench.id).current!;
  const scope = { user, session: sessionId, item: bench.id, slot: selected.id };
  const draft = recoverSetDraft(null, 'new', { weight: 60.123456, reps: 8 }, 'metric');
  draft.entry.draft.weight = '80,5';
  draft.entry.draft.notes = 'Keep this while waiting for the bench';
  await drafts.save(scope, draft);
  const rowSlot = chooseWorkoutSlot(detail, row.id).current!;
  const rowScope = { ...scope, item: row.id, slot: rowSlot.id };
  const rowDraft = recoverSetDraft(null, 'new', { weight: 10, reps: 12 }, 'metric');
  await drafts.save(rowScope, rowDraft);
  await adjustSession(
    db,
    user,
    sessionId,
    { kind: 'move', item: bench, order: detail.itemView.items, direction: 'later' },
    at(1),
  );
  await updateSession(db, user, sessionId, { notes: '', easierToday: true }, at(2));
  detail = await read();
  const reviewedBench = detail.itemView.items.find((item) => item.id === bench.id)!;
  expect(chooseWorkoutSlot(detail, bench.id).current).toEqual(selected);
  const restarted = createWorkoutDraftStore(storage);
  const recovered = recoverSetDraft(
    (await restarted.load(scope)).record,
    draftResultRevision(detail.resultRecords, selected.id),
    { weight: 20, reps: 6 },
    'imperial',
  );
  expect(recovered).toEqual(draft);
  const values = parseSetDraft(
    recovered.entry.draft,
    bench.exercise.logFields,
    recovered.units,
    recovered.entry.original,
  );
  expect(values).toEqual({ weight: 80.5, reps: 8, notes: draft.entry.draft.notes });
  const input = {
    item: reviewedBench,
    setIndex: 0,
    values,
    difficulty: 'standard' as const,
    easierToday: true,
  };
  await logStableSet(db, user, input, at(3));
  // The process dies here before draft cleanup. Canonical performance is already committed.
  detail = await read();
  expect(chooseWorkoutSlot(detail, bench.id).current?.setIndex).toBe(1);
  await expect(logStableSet(db, user, input, at(3))).rejects.toThrow();
  expect(detail.resultView.loggedResults).toHaveLength(1);
  const revision = draftResultRevision(detail.resultRecords, selected.id);
  expect(revision).not.toBe(draft.baseRevision);
  const fresh = recoverSetDraft((await restarted.load(scope)).record, revision, values, 'imperial');
  expect(fresh.entry.draft.weight).not.toBe('80,5');
  const saved = detail.resultView.loggedResults[0]!.log;
  await removeLoggedSet(db, user, { ...saved, deletedAt: null }, at(4));
  detail = await read();
  const deletedRevision = draftResultRevision(detail.resultRecords, selected.id);
  expect(deletedRevision).not.toBe(revision);
  expect(recoverSetDraft(draft, deletedRevision, { weight: 55 }, 'metric').entry.draft.weight).toBe(
    '55',
  );
  expect((await restarted.load(rowScope)).record).toEqual(rowDraft);
});
