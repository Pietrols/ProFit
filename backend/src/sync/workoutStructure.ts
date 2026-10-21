import { z } from 'zod';
import { exerciseTargetFields, syncFields } from './wireFields.js';
import {
  hasSetResult,
  setLogRecord,
  valuesMatchFields,
  workoutSnapshot,
} from './workoutSchemas.js';

// Legacy and stable wire variants share the minimum-protocol gate defined in D42.
export const sessionItemRecord = z
  .strictObject({
    ...syncFields,
    sessionId: z.uuid(),
    origin: z.enum(['planned', 'added', 'replacement']),
    originalPosition: z.number().int().min(0).max(99).nullable(),
    replacesItemId: z.uuid().nullable(),
    position: z.number().int().min(0).max(10000),
    state: z.enum(['active', 'skipped', 'removed']),
    reason: z.string().max(500).nullable(),
    exercise: workoutSnapshot.shape.exercises.element,
  })
  .refine((item) => {
    if (item.origin === 'planned')
      return item.originalPosition !== null && item.replacesItemId === null;
    if (item.originalPosition !== null) return false;
    return item.origin === 'added'
      ? item.replacesItemId === null
      : item.replacesItemId !== null && item.replacesItemId !== item.id;
  }, 'item origin must match its original or replacement link');

export const performanceTargets = z.strictObject({
  sets: exerciseTargetFields.sets,
  targetReps: exerciseTargetFields.targetReps,
  targetTimeSeconds: exerciseTargetFields.targetTimeSeconds,
  targetDistanceMetres: exerciseTargetFields.targetDistanceMetres,
  restSeconds: exerciseTargetFields.restSeconds,
});

const legacyResult = setLogRecord.safeExtend({
  itemId: z.null().optional(),
  side: z.null().optional(),
  targetsAtPerformance: z.null().optional(),
});
export const stableSetRecord = z
  .strictObject({
    ...setLogRecord.shape,
    exercisePosition: setLogRecord.shape.exercisePosition.nullable(),
    itemId: z.uuid(),
    side: z.literal('bilateral'),
    targetsAtPerformance: performanceTargets,
  })
  .refine(valuesMatchFields, 'values must use selected fields')
  .refine(hasSetResult, 'enter a result or mark done')
  .refine((set) => set.setIndex < set.targetsAtPerformance.sets, 'slot must exist at performance');

export const workoutSetRecord = z.union([legacyResult, stableSetRecord]);
