import { workoutItemProgress } from './itemProgress';
import type { StructuredWorkoutDetail } from './structuredDetail';
import type { WorkoutSlot } from './workoutSelection';

export function workoutPreview(detail: StructuredWorkoutDetail, current: WorkoutSlot | null) {
  if (
    !current ||
    detail.session.status !== 'active' ||
    !detail.resultView.available ||
    !detail.itemView.available
  )
    return null;
  const rows = workoutItemProgress(detail);
  const currentIndex = rows.findIndex((row) => row.item.id === current.itemId);
  if (currentIndex < 0) return null;
  // Preview the next exercise occurrence, then wrap to deferred earlier work.
  for (let offset = 1; offset < rows.length; offset += 1) {
    const index = (currentIndex + offset) % rows.length;
    const row = rows[index]!;
    if (row.canTrain) return { item: row.item, ordinal: index + 1, remaining: row.remaining };
  }
  return null;
}
