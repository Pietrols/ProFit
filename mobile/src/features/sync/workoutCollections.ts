import type { Collection } from './collections';

// Registered with the required workout_structure_v1 negotiation gate.
export const sessionItemsCollection: Collection = {
  name: 'session_items',
  fields: [
    { column: 'session_id', wire: 'sessionId' },
    { column: 'origin', wire: 'origin' },
    { column: 'original_position', wire: 'originalPosition' },
    { column: 'replaces_item_id', wire: 'replacesItemId' },
    { column: 'position', wire: 'position' },
    { column: 'state', wire: 'state' },
    { column: 'reason', wire: 'reason' },
    { column: 'exercise', wire: 'exercise', json: true },
  ],
};

export function withWorkoutResultFields(legacy: Collection): Collection {
  return {
    name: legacy.name,
    fields: [
      ...legacy.fields,
      { column: 'item_id', wire: 'itemId' },
      { column: 'side', wire: 'side' },
      {
        column: 'targets_at_performance',
        wire: 'targetsAtPerformance',
        json: true,
        nullable: true,
      },
    ],
  };
}
