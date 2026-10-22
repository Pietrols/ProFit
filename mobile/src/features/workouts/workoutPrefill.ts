import { prefillFromSets, sessionTargets } from './logic';
import type { StructuredWorkoutDetail } from './structuredDetail';
import type { SetValues, SnapshotExercise } from './types';

type PrefillContext = Pick<StructuredWorkoutDetail, 'session' | 'resultView' | 'previousSets'>;

// Both sources are already scoped and resolved. Only this workout and its relevant history are read.
export function workoutPrefill(detail: PrefillContext, exercise: SnapshotExercise): SetValues {
  if (!detail.resultView.available) return {};
  return prefillFromSets(
    exercise,
    sessionTargets(exercise, detail.session.snapshot.difficulty, detail.session.easierToday),
    [...detail.previousSets, ...detail.resultView.results],
  );
}
