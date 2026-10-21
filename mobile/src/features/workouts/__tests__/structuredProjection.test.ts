import { expect, it } from 'vitest';
import { projectPerformedHistory, projectWorkoutHistory } from '../historyProjection';
import { setLogId } from '../identity';
import { sessionItemsView } from '../sessionItemsView';
import { sessionSlotId } from '../structureIdentity';
import { capturePerformanceTargets } from '../structureTargets';
import type { SessionItem, StableSetLog } from '../structureTypes';
import { workoutResultsView } from '../workoutResultsView';
import { at, other, session, sessionId, set } from './fixtures';

const parent = () => ({
  ...session(),
  id: sessionId,
  updatedAt: at(5).toISOString(),
  endedAt: at(5).toISOString(),
  status: 'completed' as const,
});
const planned = () => sessionItemsView(parent(), []).items[0]!;
const legacy = () => ({ ...set(), id: setLogId(sessionId, 0, 0), updatedAt: at(1).toISOString() });

it('preserves exact legacy projection rows through the effective view', () => {
  const logs = [
    legacy(),
    { ...legacy(), id: setLogId(sessionId, 0, 1), setIndex: 1, values: { reps: 0, weight: 80 } },
  ];
  const items = sessionItemsView(parent(), []);
  expect(
    projectPerformedHistory(parent(), workoutResultsView(parent(), items, logs).results),
  ).toEqual(projectWorkoutHistory({ session: parent(), logs }));
});

it('projects an added exercise by its stable identity and keeps independent performance metadata', () => {
  const item: SessionItem = {
    ...planned(),
    id: other,
    origin: 'added',
    originalPosition: null,
    replacesItemId: null,
    state: 'removed',
    exercise: { ...planned().exercise, exerciseId: 'Added_row', sets: 1 },
  };
  const log: StableSetLog = {
    ...legacy(),
    id: sessionSlotId(item, 2),
    itemId: item.id,
    exercisePosition: null,
    setIndex: 2,
    side: 'bilateral',
    targetsAtPerformance: capturePerformanceTargets(planned().exercise, 'hard', false),
  };
  const view = workoutResultsView(parent(), sessionItemsView(parent(), [item]), [log]);
  const row = projectPerformedHistory(parent(), view.results)[0]!;
  expect(row).toMatchObject({
    id: log.id,
    exerciseId: 'Added_row',
    weight: 45,
    reps: 8,
    eligibleWeight: 45,
    completedMs: at(5).getTime(),
    log: { exercisePosition: null, targetsAtPerformance: { sets: 3, targetReps: 10 } },
  });
  expect(row.oneRepMax).toBe(45 * (1 + 8 / 30));
  if ('itemId' in row.log) row.log.targetsAtPerformance.sets = 1;
  row.log.values.weight = 999;
  expect(log.targetsAtPerformance.sets).toBe(3);
  expect(log.values.weight).toBe(45);
  expect(
    projectPerformedHistory({ ...parent(), status: 'active', endedAt: null }, view.results),
  ).toEqual([]);
});
