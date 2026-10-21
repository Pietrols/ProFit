import { z } from 'zod';
import {
  calendarDate,
  exerciseId,
  exerciseTargetFields,
  isoTime,
  name,
  syncFields,
} from './wireFields.js';

// Mirrored in mobile/src/features/workouts/model.ts.
export const workoutSnapshot = z
  .strictObject({
    planName: name,
    dayName: name,
    difficulty: z.enum(['gentle', 'standard', 'hard']),
    restDay: z.boolean(),
    exercises: z
      .array(
        z.strictObject({
          exerciseId,
          name,
          ...exerciseTargetFields,
        }),
      )
      .max(100),
  })
  .refine(
    (s) => (s.restDay ? s.exercises.length === 0 : s.exercises.length > 0),
    'choose a training exercise or a rest day',
  );
export const workoutSessionRecord = z
  .strictObject({
    ...syncFields,
    planId: z.uuid(),
    dayId: z.uuid(),
    localDate: calendarDate,
    startedAt: isoTime,
    endedAt: isoTime.nullable(),
    status: z.enum(['active', 'completed', 'abandoned']),
    notes: z.string().max(2000),
    easierToday: z.boolean(),
    snapshot: workoutSnapshot,
  })
  .refine(
    (s) =>
      s.status === 'active'
        ? s.endedAt === null
        : s.endedAt !== null && Date.parse(s.endedAt) >= Date.parse(s.startedAt),
    'end time must match status and follow start',
  );
export const setValues = z.strictObject({
  reps: z.number().int().min(0).max(1000).optional(),
  weight: z.number().min(0).max(2000).optional(),
  time: z.number().min(0).max(86400).optional(),
  distance: z.number().min(0).max(1000000).optional(),
  rest: z.number().min(0).max(3600).optional(),
  RPE: z.number().min(0).max(10).optional(),
  notes: z.string().max(2000).optional(),
  done: z.boolean().optional(),
});
type SetData = { values: z.infer<typeof setValues>; logFields: readonly string[] };
export const valuesMatchFields = (set: SetData) =>
  Object.keys(set.values).every((key) => set.logFields.includes(key));
export const hasSetResult = (set: Pick<SetData, 'values'>) =>
  Object.values(set.values).some(
    (value) =>
      typeof value === 'number' ||
      value === true ||
      (typeof value === 'string' && value.trim().length > 0),
  );
export const setLogRecord = z
  .strictObject({
    ...syncFields,
    sessionId: z.uuid(),
    exercisePosition: z.number().int().min(0).max(99),
    setIndex: z.number().int().min(0).max(99),
    loggedAt: isoTime,
    logFields: exerciseTargetFields.logFields,
    values: setValues,
  })
  .refine(valuesMatchFields, 'values must use selected fields')
  .refine(hasSetResult, 'enter a result or mark done');
