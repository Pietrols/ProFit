import { expect, it } from 'vitest';
import { sessionItemsView } from '../sessionItemsView';
import { workoutResultsView } from '../workoutResultsView';
import { chooseWorkoutSlot } from '../workoutSelection';
import { workoutPreview } from '../workoutPreview';
import { at, session, sessionId } from './fixtures';
import type { StructuredWorkoutDetail } from '../structuredDetail';

function fixture() {
  const parent = { ...session(), id: sessionId, updatedAt: at(0).toISOString() };
  parent.snapshot.exercises.push({
    ...parent.snapshot.exercises[0]!,
    name: 'Rows',
    exerciseId: 'Dumbbell_Row',
  });
  parent.snapshot.exercises.push({ ...parent.snapshot.exercises[0]!, name: 'Bench again' });
  const itemView = sessionItemsView(parent, []);
  const detail: StructuredWorkoutDetail = {
    session: parent,
    itemView,
    resultView: workoutResultsView(parent, itemView, []),
    itemRecords: [],
    resultRecords: [],
    previousSets: [],
  };
  return detail;
}

it('previews another occurrence instead of repeating every remaining set in the current exercise', () => {
  const detail = fixture();
  const selection = chooseWorkoutSlot(detail, null);
  expect(selection.following?.itemId).toBe(selection.current?.itemId);
  expect(workoutPreview(detail, selection.current)).toMatchObject({
    item: { exercise: { name: 'Rows' } },
    ordinal: 2,
    remaining: 3,
  });
  const last = chooseWorkoutSlot(detail, detail.itemView.items[2]!.id);
  expect(workoutPreview(detail, last.current)?.ordinal).toBe(1);
});

it('omits skipped and removed work, unavailable data and ended sessions', () => {
  const detail = fixture();
  detail.itemView.items[1]!.state = 'skipped';
  const current = chooseWorkoutSlot(detail, null).current;
  expect(workoutPreview(detail, current)?.ordinal).toBe(3);
  detail.itemView.items[2]!.state = 'removed';
  expect(workoutPreview(detail, current)).toBeNull();
  detail.itemView.available = false;
  expect(workoutPreview(detail, current)).toBeNull();
  expect(workoutPreview(fixture(), null)).toBeNull();
});
