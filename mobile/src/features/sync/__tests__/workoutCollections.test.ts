import { expect, it } from 'vitest';
import {
  fromWire,
  setLogsCollection,
  syncedCollections,
  toWire,
  type Collection,
  type WireRecord,
} from '../collections';
import { sessionItemsCollection, withWorkoutResultFields } from '../workoutCollections';
import { at, sessionId, snapshot } from '../../workouts/__tests__/fixtures';

function roundTrip(collection: Collection, record: WireRecord) {
  const stored = fromWire(collection, record);
  const row = Object.fromEntries(
    stored.columns.map((column, index) => [column, stored.values[index]]),
  );
  return { row, wire: toWire(collection, row) };
}
const legacy: WireRecord = {
  id: sessionId,
  updatedAt: at(1).toISOString(),
  deletedAt: null,
  sessionId,
  exercisePosition: 0,
  setIndex: 0,
  loggedAt: at(1).toISOString(),
  logFields: ['weight', 'reps'],
  values: { weight: 0, reps: 8 },
};

it('keeps absent legacy metadata as SQL NULL instead of JSON arrays on pull and push', () => {
  const { row, wire } = roundTrip(setLogsCollection, legacy);
  expect(row.targets_at_performance).toBeNull();
  expect(wire).toEqual({ ...legacy, itemId: null, side: null, targetsAtPerformance: null });
  expect(fromWire(setLogsCollection, wire).values).toContain(null);
});

it('round-trips stable nullable positions, target objects and tombstones without changing numeric zero', () => {
  const record = {
    ...legacy,
    exercisePosition: null,
    itemId: sessionId,
    side: 'bilateral',
    deletedAt: at(2).toISOString(),
    targetsAtPerformance: {
      sets: 3,
      targetReps: 8,
      targetTimeSeconds: null,
      targetDistanceMetres: null,
      restSeconds: 0,
    },
  };
  const { row, wire } = roundTrip(setLogsCollection, record);
  expect(row.exercise_position).toBeNull();
  expect(wire).toEqual(record);
});

it('round-trips session-item snapshots and preserves the existing JSON-list default convention', () => {
  const record = {
    id: sessionId,
    updatedAt: at(1).toISOString(),
    deletedAt: null,
    sessionId,
    origin: 'added',
    originalPosition: null,
    replacesItemId: null,
    position: 1,
    state: 'active',
    reason: null,
    exercise: snapshot().exercises[0]!,
  };
  expect(roundTrip(sessionItemsCollection, record).wire).toEqual(record);
  const oldList: Collection = {
    name: 'example',
    fields: [{ column: 'items', wire: 'items', json: true }],
  };
  expect(fromWire(oldList, legacy).values.at(-1)).toBe('[]');
});

it('registers both mappings once and extends a base without mutating it', () => {
  expect(syncedCollections.filter((collection) => collection.name === 'session_items')).toEqual([
    sessionItemsCollection,
  ]);
  expect(syncedCollections.filter((collection) => collection.name === 'set_logs')).toEqual([
    setLogsCollection,
  ]);
  expect(new Set(setLogsCollection.fields.map((field) => field.column)).size).toBe(
    setLogsCollection.fields.length,
  );
  const base: Collection = { name: 'set_logs', fields: [] };
  expect(withWorkoutResultFields(base).fields).toHaveLength(3);
  expect(base.fields).toEqual([]);
});
