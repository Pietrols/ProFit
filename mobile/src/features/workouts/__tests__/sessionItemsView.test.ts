import { expect, it } from 'vitest';
import { sessionItemsView } from '../sessionItemsView';
import { plannedItemId } from '../structureIdentity';
import type { SessionItem } from '../structureTypes';
import { at, other, session, sessionId } from './fixtures';

const parent = () => ({ ...session(), id: sessionId, updatedAt: at(0).toISOString() });
const planned = () => sessionItemsView(parent(), []).items[0]!;
const added = (id = other): Extract<SessionItem, { origin: 'added' }> => ({
  ...planned(),
  id,
  origin: 'added',
  originalPosition: null,
  replacesItemId: null,
});

it('adapts duplicate original occurrences without writing or sharing mutable snapshot values', () => {
  const original = parent();
  original.snapshot.exercises.push(structuredClone(original.snapshot.exercises[0]!));
  const before = structuredClone(original);
  const view = sessionItemsView(original, []);
  expect(view.available).toBe(true);
  expect(view.items.map((item) => item.id)).toEqual([
    plannedItemId(sessionId, 0),
    plannedItemId(sessionId, 1),
  ]);
  view.items[0]!.exercise.logFields.push('time');
  expect(original).toEqual(before);
  expect(view.items[1]!.exercise.logFields).not.toContain('time');
});

it('retains skipped, removed and tombstoned context while applying independent display order', () => {
  const changes: SessionItem[] = [
    { ...planned(), state: 'skipped', deletedAt: at(2).toISOString(), position: 5 },
    { ...added(), state: 'removed', position: 0 },
  ];
  const before = structuredClone(changes);
  const view = sessionItemsView(parent(), changes);
  expect(view.available).toBe(true);
  expect(view.items.map((item) => item.id)).toEqual([other, planned().id]);
  expect(view.items[1]).toEqual(changes[0]);
  view.items[1]!.exercise.sets = 1;
  expect(changes).toEqual(before);
});

it('blocks malformed latest overrides and unreadable rows instead of restoring the original work', () => {
  for (const broken of [
    { ...planned(), updatedAt: 'invalid' },
    { ...planned(), updatedAt: at(2).toISOString(), position: -1 },
  ]) {
    const view = sessionItemsView(parent(), [planned(), broken]);
    expect(view.available).toBe(false);
    expect(view.items).toEqual([]);
    expect(view.unavailableItemIds).toEqual([planned().id]);
  }
  const unreadable = sessionItemsView(parent(), [], [planned().id]);
  expect(unreadable.items).toEqual([]);
  expect(unreadable.available).toBe(false);
});

it('waits for owned replacement parents and rejects cycles without losing unrelated work', () => {
  const replacement: SessionItem = { ...added(), origin: 'replacement', replacesItemId: sessionId };
  const missing = sessionItemsView(parent(), [replacement]);
  expect(missing.unavailableItemIds).toEqual([other]);
  const foreign = { ...added(sessionId), sessionId: other };
  expect(sessionItemsView(parent(), [replacement, foreign])).toEqual(missing);
  const cycle: SessionItem = { ...added(sessionId), origin: 'replacement', replacesItemId: other };
  expect(sessionItemsView(parent(), [replacement, cycle]).unavailableItemIds).toEqual([
    other,
    sessionId,
  ]);
  const arrived = sessionItemsView(parent(), [
    replacement,
    { ...added(sessionId), state: 'removed' },
  ]);
  expect(arrived.available).toBe(true);
  expect(arrived.items).toHaveLength(3);
  expect(
    sessionItemsView({ ...parent(), deletedAt: at(3).toISOString() }, [replacement]).available,
  ).toBe(false);
});

it('resolves restore revisions and rejects unavailable session identities without throwing', () => {
  const removed = { ...planned(), state: 'removed' as const, deletedAt: at(1).toISOString() };
  const restored = { ...planned(), updatedAt: at(2).toISOString() };
  const view = sessionItemsView(parent(), [restored, removed]);
  expect(view.items).toEqual([restored]);
  expect(view.available).toBe(true);
  expect(sessionItemsView({ ...parent(), id: 'invalid' }, []).available).toBe(false);
});
