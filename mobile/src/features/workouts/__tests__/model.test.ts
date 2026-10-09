import { describe, expect, it } from 'vitest';
import { validateSession, validateSet, validateSnapshot } from '../model';
import { session, set, snapshot } from './fixtures';

describe('workout validation', () => {
  it('accepts a training snapshot and rest day with no exercises', () => {
    expect(validateSession(session())).toBeNull();
    expect(validateSnapshot({ ...snapshot(), restDay: true, exercises: [] })).toBeNull();
    expect(validateSet(set(), snapshot())).toBeNull();
  });
  it.each([
    { localDate: '2026-02-30' }, { startedAt: 'yesterday' }, { startedAt: '2026-10-09T24:00:00Z' },
    { status: 'finished' }, { endedAt: '2026-10-09T10:00:00Z' }, { status: 'completed', endedAt: null },
    { status: 'completed', endedAt: '2026-10-08T10:00:00Z' }, { notes: 'x'.repeat(2001) },
    { snapshot: null }, { snapshot: { ...snapshot(), exercises: [] } },
    { snapshot: { ...snapshot(), restDay: true } }, { snapshot: { ...snapshot(), exercises: Array(101).fill(snapshot().exercises[0]) } },
    { snapshot: { ...snapshot(), exercises: [{ ...snapshot().exercises[0], logFields: ['reps', 'reps'] }] } },
    { snapshot: { ...snapshot(), exercises: [{ ...snapshot().exercises[0], targetReps: NaN }] } },
  ])('rejects invalid session %j', (patch) => {
    expect(validateSession({ ...session(), ...patch })).not.toBeNull();
  });
  it.each([
    { values: { reps: 1.5 } }, { values: { weight: Infinity } }, { values: { RPE: 11 } },
    { values: { notes: 'x'.repeat(2001) } }, { values: { reps: null } }, { exercisePosition: 100 }, { setIndex: -1 },
    { values: { done: false }, logFields: ['done'] }, { values: { notes: ' ' }, logFields: ['notes'] },
    { values: {} }, { values: { weight: 20 }, logFields: ['reps'] }, { values: { unknown: 1 } },
    { logFields: ['reps', 'reps'] }, { values: { reps: undefined } },
  ])('rejects invalid set %j', (patch) => {
    expect(validateSet({ ...set(), ...patch })).not.toBeNull();
  });
  it('accepts zeros, notes-only and done-only values, without extra fields', () => {
    for (const patch of [
      { logFields: ['reps', 'weight'], values: { reps: 0, weight: 0 } },
      { logFields: ['notes'], values: { notes: 'Mobility complete' } },
      { logFields: ['done'], values: { done: true } },
    ]) expect(validateSet({ ...set(), ...patch })).toBeNull();
  });
  it('checks set slots and chosen fields against the saved snapshot', () => {
    for (const patch of [{ setIndex: 3 }, { exercisePosition: 1 }, { logFields: ['reps'], values: { reps: 8 } }]) {
      expect(validateSet({ ...set(), ...patch }, snapshot())).not.toBeNull();
    }
  });
  it('rejects malformed input without throwing', () => {
    for (const value of [null, [], undefined, 0, {}, { values: null }]) {
      expect(validateSession(value)).not.toBeNull(); expect(validateSet(value)).not.toBeNull();
    }
  });
});
