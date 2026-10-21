import { sessionInput, validateSession, validUuid } from './model';
import { resolveRecordRevisions } from './recordOrder';
import { plannedItemId } from './structureIdentity';
import { validateSessionItem } from './structureModel';
import type { SessionItem } from './structureTypes';
import type { WorkoutSession } from './types';

export type SessionItemsView = {
  items: SessionItem[];
  unavailableItemIds: string[];
  available: boolean;
};

function plannedItems(session: WorkoutSession): SessionItem[] {
  return session.snapshot.exercises.map((exercise, originalPosition) => ({
    id: plannedItemId(session.id, originalPosition),
    sessionId: session.id,
    origin: 'planned',
    originalPosition,
    replacesItemId: null,
    position: originalPosition,
    state: 'active',
    reason: null,
    exercise: { ...exercise, logFields: [...exercise.logFields] },
    // This is a read-only baseline, not a canonical revision to save or sync.
    updatedAt: session.startedAt,
    deletedAt: null,
  }));
}

// Inputs and unavailable ids must already be scoped to the signed-in owner.
export function sessionItemsView(
  session: WorkoutSession & { deletedAt?: string | null },
  records: readonly SessionItem[],
  unavailableIds: readonly string[] = [],
): SessionItemsView {
  if (!validUuid(session.id) || session.deletedAt || validateSession(sessionInput(session)))
    return { items: [], unavailableItemIds: [], available: false };
  const items = new Map(plannedItems(session).map((item) => [item.id, item]));
  const scoped = records.filter((item) => item.sessionId === session.id);
  const revisions = resolveRecordRevisions(scoped);
  const blocked = new Set([...unavailableIds, ...revisions.unavailableIds]);
  const unavailable = new Set(blocked);
  // Any stored override blocks fallback, even if it has an unreadable edit time.
  for (const item of scoped) {
    items.delete(item.id);
    unavailable.add(item.id);
  }
  for (const item of revisions.latest) {
    if (blocked.has(item.id) || validateSessionItem(item, session)) continue;
    items.set(item.id, {
      ...item,
      exercise: { ...item.exercise, logFields: [...item.exercise.logFields] },
    });
    unavailable.delete(item.id);
  }
  for (const id of blocked) items.delete(id);

  const linked = new Map<string, boolean>();
  function validLink(id: string): boolean {
    const path = new Set<string>();
    let current = id;
    let valid = false;
    while (true) {
      const known = linked.get(current);
      if (known !== undefined) {
        valid = known;
        break;
      }
      const item = items.get(current);
      if (!item || path.has(current)) break;
      path.add(current);
      if (item.origin !== 'replacement') {
        valid = true;
        break;
      }
      current = item.replacesItemId;
    }
    for (const visited of path) linked.set(visited, valid);
    return valid;
  }
  for (const item of items.values()) {
    if (!validLink(item.id)) unavailable.add(item.id);
  }
  return {
    items: [...items.values()]
      .filter((item) => !unavailable.has(item.id))
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    unavailableItemIds: [...unavailable].sort(),
    available: unavailable.size === 0,
  };
}
