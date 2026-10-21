import { expect, it } from 'vitest';
import {
  draftResultRevision,
  readDraftRecord,
  recoverSetDraft,
  workoutDraftKey,
} from '../draftRecord';
import { parseSetDraft } from '../workoutForm';
import { at, other, sessionId, set, user } from './fixtures';

it('pins exact prefills, units and raw custom fields across changed profile, targets and reads', () => {
  const original = { weight: 45.123456, distance: 1234.56789, reps: 8 };
  const saved = recoverSetDraft(null, 'new', original, 'imperial');
  saved.entry.draft.notes = 'Left shoulder felt tight';
  saved.entry.draft.RPE = '7,5';
  const recovered = recoverSetDraft(
    readDraftRecord(JSON.parse(JSON.stringify(saved))),
    'new',
    { reps: 6 },
    'metric',
  );
  expect(recovered.units).toBe('imperial');
  expect(
    parseSetDraft(
      recovered.entry.draft,
      ['weight', 'distance', 'reps', 'RPE', 'notes'],
      recovered.units,
      recovered.entry.original,
    ),
  ).toEqual({ ...original, RPE: 7.5, notes: saved.entry.draft.notes });
  saved.entry.draft.weight = 'unfinished,entry';
  expect(recoverSetDraft(saved, 'new', {}, 'metric').entry.draft.weight).toBe('unfinished,entry');
});

it('scopes drafts to account, session, occurrence and slot without depending on display order', () => {
  const scope = { user, session: sessionId, item: user, slot: other };
  const key = workoutDraftKey(scope);
  for (const field of ['user', 'session', 'item', 'slot'] as const) {
    expect(
      workoutDraftKey({ ...scope, [field]: field === 'item' || field === 'user' ? other : user }),
    ).not.toBe(key);
  }
  expect(() => workoutDraftKey({ ...scope, user: 'bad' })).toThrow();
});

it('lets saved, corrected and deleted results supersede a draft after a crash', () => {
  const row = { ...set(), id: user, updatedAt: at(2).toISOString() };
  const saved = recoverSetDraft(null, 'new', { weight: 80 }, 'metric');
  const revision = draftResultRevision([row], user);
  const fresh = recoverSetDraft(saved, revision, { weight: 60 }, 'imperial');
  expect(fresh.entry.original).toEqual({ weight: 60 });
  const deleted = { ...row, deletedAt: at(3).toISOString(), updatedAt: at(3).toISOString() };
  expect(draftResultRevision([row, deleted], user)).not.toBe(revision);
  expect(draftResultRevision([{ ...row, values: { weight: 61 } }], user)).not.toBe(revision);
  expect(draftResultRevision([], user)).toBe('new');
});

it('rejects corrupted or future records without discarding unreadable storage', () => {
  const saved = recoverSetDraft(null, 'new', {}, 'metric');
  for (const value of [
    null,
    { ...saved, version: 2 },
    { ...saved, extra: true },
    { ...saved, entry: { original: { weight: -1 }, draft: {} } },
    { ...saved, entry: { original: {}, draft: { unknown: '1' } } },
  ]) {
    expect(() => readDraftRecord(value)).toThrow('draft');
  }
});
