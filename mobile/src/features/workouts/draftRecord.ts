import { LOG_FIELDS } from '../plans/types';
import { validUuid, validateLoggedValues } from './model';
import { latestRecords } from './recordOrder';
import { setRevision } from './setChanges';
import type { WorkoutResult } from './structureTypes';
import type { SetValues } from './types';
import { setDraft, type SetDraftEntry, type Units } from './workoutForm';

export type DraftScope = { user: string; session: string; item: string; slot: string };
export type DraftRecord = {
  version: 1;
  units: Units;
  baseRevision: string;
  entry: SetDraftEntry;
};

export function workoutDraftKey(scope: DraftScope): string {
  const ids = [scope.user, scope.session, scope.item, scope.slot];
  if (!ids.every(validUuid)) throw new Error('Choose a valid workout set.');
  return `workout-draft:v1:${ids.join(':')}`;
}

export function draftResultRevision(results: readonly WorkoutResult[], slot: string): string {
  const saved = latestRecords(results).find((result) => result.id === slot);
  return saved ? setRevision({ ...saved, deletedAt: saved.deletedAt ?? null }) : 'new';
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const only = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

export function readDraftRecord(value: unknown): DraftRecord {
  if (
    !object(value) ||
    !only(value, ['version', 'units', 'baseRevision', 'entry']) ||
    value.version !== 1 ||
    (value.units !== 'metric' && value.units !== 'imperial') ||
    typeof value.baseRevision !== 'string' ||
    !value.baseRevision.length ||
    value.baseRevision.length > 10000 ||
    !object(value.entry) ||
    !only(value.entry, ['original', 'draft']) ||
    !object(value.entry.original) ||
    !object(value.entry.draft)
  )
    throw new Error('The saved set draft could not be read. Retry before editing this set.');
  const { original, draft } = value.entry;
  if (
    (Object.keys(original).length > 0 && validateLoggedValues(LOG_FIELDS, original)) ||
    !only(draft, LOG_FIELDS) ||
    Object.values(draft).some((text) => typeof text !== 'string' || text.length > 2000)
  )
    throw new Error('The saved set draft is invalid. Retry before editing this set.');
  return {
    version: 1,
    units: value.units,
    baseRevision: value.baseRevision,
    entry: { original: { ...original }, draft: { ...draft } },
  };
}

export function recoverSetDraft(
  saved: DraftRecord | null,
  baseRevision: string,
  original: SetValues,
  units: Units,
): DraftRecord {
  if (saved?.baseRevision === baseRevision) return readDraftRecord(saved);
  return {
    version: 1,
    units,
    baseRevision,
    entry: { original: { ...original }, draft: setDraft(original, units) },
  };
}
