import { performedResults } from './logic';
import { sessionSlotId } from './structureIdentity';
import type { StructuredWorkoutDetail } from './structuredDetail';

type ResultsInput = Pick<
  StructuredWorkoutDetail,
  'session' | 'itemView' | 'resultView' | 'previousSets'
>;
export function structuredWorkoutResults({
  session,
  itemView,
  resultView,
  previousSets,
}: ResultsInput) {
  const available = itemView.available && resultView.available;
  const completedSlots = new Set(
    resultView.results.map(({ itemId, log }) => `${itemId}:${log.setIndex}`),
  );
  let total = 0;
  let completed = 0;
  let next: { itemId: string; setIndex: number; id: string } | null = null;
  for (const item of itemView.items) {
    if (item.deletedAt || item.state !== 'active') continue;
    total += item.exercise.sets;
    for (let setIndex = 0; setIndex < item.exercise.sets; setIndex += 1) {
      if (completedSlots.has(`${item.id}:${setIndex}`)) completed += 1;
      else if (!next && available && session.status === 'active')
        next = { itemId: item.id, setIndex, id: sessionSlotId(item, setIndex) };
    }
  }
  const metrics = performedResults(session, resultView.results, previousSets);
  return {
    total,
    completed,
    actualCompleted: resultView.results.length,
    outsideTargetCompleted: resultView.results.length - completed,
    next,
    available,
    volumeKg: metrics.volumeKg,
    records: available ? metrics.records : [],
  };
}
