import { setInput, validateSet, validTime, validUuid } from './model';
import { validateSessionItem, validateStableSetRecord } from './structureModel';
import type { SessionItem, WorkoutResult } from './structureTypes';
import type { SetLog } from './types';

export const ITEM_COLUMNS = `id, session_id AS sessionId, origin, original_position AS originalPosition,
  replaces_item_id AS replacesItemId, position, state, reason, exercise,
  updated_at AS updatedAt, deleted_at AS deletedAt`;
export const RESULT_COLUMNS = `id, session_id AS sessionId, exercise_position AS exercisePosition,
  set_index AS setIndex, logged_at AS loggedAt, log_fields AS logFields, values_json AS [values],
  updated_at AS updatedAt, deleted_at AS deletedAt, item_id AS itemId, side,
  targets_at_performance AS targetsAtPerformance`;
export type ItemRow = Omit<SessionItem, 'exercise'> & { exercise: string };
export type ResultRow = Omit<SetLog, 'exercisePosition' | 'logFields' | 'values'> & {
  exercisePosition: number | null;
  logFields: string;
  values: string;
  deletedAt: string | null;
  itemId: string | null;
  side: string | null;
  targetsAtPerformance: string | null;
};

// Decode shapes only. Owned parent, identity and performance-time joins happen in the view.
export function decodeItem(row: ItemRow): SessionItem | null {
  try {
    const item = { ...row, exercise: JSON.parse(row.exercise) as unknown };
    return validateSessionItem(item) ? null : (item as SessionItem);
  } catch {
    return null;
  }
}

export function decodeResult(row: ResultRow): WorkoutResult | null {
  try {
    const { itemId, side, targetsAtPerformance, ...rest } = row;
    const result = {
      ...rest,
      logFields: JSON.parse(row.logFields) as SetLog['logFields'],
      values: JSON.parse(row.values) as SetLog['values'],
    };
    if (itemId === null && side === null && targetsAtPerformance === null) {
      if (
        !validUuid(result.id) ||
        !validTime(result.updatedAt) ||
        (result.deletedAt !== null && !validTime(result.deletedAt)) ||
        validateSet(setInput(result as SetLog))
      )
        return null;
      return result as SetLog & { deletedAt: string | null };
    }
    const stable = {
      ...result,
      itemId,
      side,
      targetsAtPerformance:
        targetsAtPerformance === null ? null : (JSON.parse(targetsAtPerformance) as unknown),
    };
    return validateStableSetRecord(stable) ? null : (stable as WorkoutResult);
  } catch {
    return null;
  }
}
