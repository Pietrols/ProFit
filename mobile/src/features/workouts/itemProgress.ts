import type { AdjustmentContext } from './sessionChanges';

export function workoutItemProgress(detail: AdjustmentContext) {
  const completed = new Map<string, Set<number>>();
  const saved = new Map<string, Set<number>>();
  for (const { itemId, log } of detail.resultView.loggedResults) {
    const slots = saved.get(itemId) ?? new Set<number>();
    slots.add(log.setIndex);
    saved.set(itemId, slots);
  }
  for (const { itemId, log } of detail.resultView.results) {
    const slots = completed.get(itemId) ?? new Set<number>();
    slots.add(log.setIndex);
    completed.set(itemId, slots);
  }
  const order = detail.itemView.items.filter((item) => !item.deletedAt);
  const indices = new Map(order.map((item, index) => [item.id, index]));
  const rows = detail.itemView.items.map((item) => {
    const count = [...(completed.get(item.id) ?? [])].filter(
      (setIndex) => setIndex < item.exercise.sets,
    ).length;
    const remaining = item.exercise.sets - count;
    return {
      item,
      completed: count,
      remaining,
      canTrain: !item.deletedAt && item.state === 'active' && remaining > 0,
      canMoveUp: (indices.get(item.id) ?? 0) > 0,
      canMoveDown: (indices.get(item.id) ?? order.length) < order.length - 1,
      canReduce: item.exercise.sets > 1 && !saved.get(item.id)?.has(item.exercise.sets - 1),
    };
  });
  const pendingItems = rows.filter((row) => row.canTrain).length;
  return rows.map((row) => ({ ...row, canDefer: row.canTrain && pendingItems > 1 }));
}
