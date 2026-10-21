import type { StructuredWorkoutDetail } from './structuredDetail';
import { sessionSlotId } from './structureIdentity';

export type WorkoutSlot = { itemId: string; setIndex: number; id: string };
type PendingSlot = Omit<WorkoutSlot, 'id'>;
type SelectionInput = Pick<StructuredWorkoutDetail, 'session' | 'itemView' | 'resultView'>;

export function chooseWorkoutSlot(detail: SelectionInput, selectedItemId: string | null) {
  if (
    detail.session.status !== 'active' ||
    !detail.itemView.available ||
    !detail.resultView.available
  )
    return { current: null, following: null };
  const completed = new Set(
    detail.resultView.results.map((row) => `${row.itemId}:${row.log.setIndex}`),
  );
  const items = new Map(detail.itemView.items.map((item) => [item.id, item]));
  const resolve = (slot: PendingSlot | null): WorkoutSlot | null =>
    slot ? { ...slot, id: sessionSlotId(items.get(slot.itemId)!, slot.setIndex) } : null;
  function* pending(): Generator<PendingSlot> {
    for (const item of detail.itemView.items) {
      if (item.deletedAt || item.state !== 'active') continue;
      for (let setIndex = 0; setIndex < item.exercise.sets; setIndex += 1) {
        if (!completed.has(`${item.id}:${setIndex}`)) yield { itemId: item.id, setIndex };
      }
    }
  }
  let first: PendingSlot | null = null;
  let current: PendingSlot | null = null;
  for (const slot of pending()) {
    first ??= slot;
    if (!selectedItemId || slot.itemId === selectedItemId) {
      current = slot;
      break;
    }
  }
  current ??= first;
  let following: PendingSlot | null = null;
  let afterCurrent = false;
  for (const slot of pending()) {
    if (slot.itemId === current?.itemId && slot.setIndex === current.setIndex) afterCurrent = true;
    else if (afterCurrent) return { current: resolve(current), following: resolve(slot) };
    else following ??= slot;
  }
  return { current: resolve(current), following: resolve(following) };
}
