import { expect, it } from 'vitest';
import { sessionItemsView } from '../sessionItemsView';
import { setLogId } from '../identity';
import { workoutResultsView } from '../workoutResultsView';
import { workoutPrefill } from '../workoutPrefill';
import { recoverSetDraft } from '../draftRecord';
import type { WorkoutResult } from '../structureTypes';
import { at, other, session, sessionId, set } from './fixtures';

function fixture(records: WorkoutResult[] = []) {
  const parent = { ...session(), id: sessionId, updatedAt: at(0).toISOString() };
  parent.snapshot.exercises[0]!.logFields.push('done');
  const itemView = sessionItemsView(parent, []);
  const exercise = parent.snapshot.exercises[0]!;
  const earlier = {
    ...set(other),
    id: setLogId(other, 0, 0),
    loggedAt: new Date(Date.parse(parent.startedAt) - 1000).toISOString(),
    values: { weight: 20, reps: 10 },
    updatedAt: at(0).toISOString(),
  };
  return {
    exercise,
    detail: {
      session: parent,
      resultView: workoutResultsView(parent, itemView, records),
      previousSets: [{ exerciseId: exercise.exerciseId, log: earlier }],
    },
  };
}
const performed = (): WorkoutResult => ({
  ...set(),
  logFields: [...set().logFields, 'done'],
  id: setLogId(sessionId, 0, 0),
  updatedAt: at(2).toISOString(),
  values: { weight: 60.123456, reps: 6, notes: 'Do not copy', RPE: 9 },
});

it('uses the latest current-workout weight while keeping planned reps and excluding notes/effort', () => {
  const { detail, exercise } = fixture([performed()]);
  const before = structuredClone(detail);
  expect(workoutPrefill(detail, exercise)).toEqual({ reps: 8, weight: 60.123456 });
  expect(detail).toEqual(before);
  detail.session.easierToday = true;
  expect(workoutPrefill(detail, exercise)).toEqual({ reps: 6, weight: 60.123456 });
});

it('keeps zero load and current corrections rather than an older historical value', () => {
  const old = performed();
  const correction = { ...old, values: { weight: 0, reps: 0 }, updatedAt: at(3).toISOString() };
  const { detail, exercise } = fixture([old, correction]);
  expect(workoutPrefill(detail, exercise)).toEqual({ reps: 8, weight: 0 });
});

it('excludes deleted/incomplete results and does not transfer a load to another exercise', () => {
  const revisions: WorkoutResult[] = [
    { ...performed(), deletedAt: at(3).toISOString() },
    { ...performed(), values: { weight: 99, done: false } },
  ];
  for (const changed of revisions) {
    const { detail, exercise } = fixture([changed]);
    expect(workoutPrefill(detail, exercise).weight).toBe(20);
  }
  const { detail, exercise } = fixture([performed()]);
  expect(workoutPrefill(detail, { ...exercise, exerciseId: 'Replacement' }).weight).toBeUndefined();
});

it('preserves an existing unsaved draft when the next suggested prefill changes', () => {
  const { detail, exercise } = fixture([performed()]);
  const draft = recoverSetDraft(null, 'new', { weight: 80, reps: 8 }, 'metric');
  draft.entry.draft.weight = 'unfinished,';
  expect(recoverSetDraft(draft, 'new', workoutPrefill(detail, exercise), 'imperial')).toEqual(
    draft,
  );
  detail.resultView.available = false;
  expect(workoutPrefill(detail, exercise)).toEqual({});
});
