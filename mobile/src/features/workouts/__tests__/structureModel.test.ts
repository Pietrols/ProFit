import { expect, it } from 'vitest';
import {
  validateSessionItem,
  validateLegacySetContext,
  validateStableSetContext,
  validateStableSetRecord,
} from '../structureModel';
import { plannedItemId, sessionSlotId } from '../structureIdentity';
import type { SessionItem, StableSetLog } from '../structureTypes';
import { at, other, session, sessionId, set, snapshot } from './fixtures';

const parent = () => ({ ...session(), id: sessionId, updatedAt: at(0).toISOString() });
const item = (): Extract<SessionItem, { origin: 'planned' }> => ({
  id: plannedItemId(sessionId, 0),
  sessionId,
  origin: 'planned',
  originalPosition: 0,
  replacesItemId: null,
  position: 0,
  state: 'active',
  reason: null,
  exercise: snapshot().exercises[0]!,
  updatedAt: at(0).toISOString(),
  deletedAt: null,
});
const result = (): StableSetLog => ({
  ...set(),
  id: sessionSlotId(item(), 0),
  updatedAt: at(1).toISOString(),
  itemId: item().id,
  side: 'bilateral',
  targetsAtPerformance: {
    sets: 3,
    targetReps: 8,
    targetTimeSeconds: null,
    targetDistanceMetres: null,
    restSeconds: 60,
  },
});

it('validates owned planned and added occurrence identities independently of display order', () => {
  expect(validateSessionItem(item(), parent())).toBeNull();
  expect(validateSessionItem({ ...item(), position: 10 }, parent())).toBeNull();
  const added: SessionItem = { ...item(), id: other, origin: 'added', originalPosition: null };
  expect(validateSessionItem(added, parent())).toBeNull();
  expect(
    validateStableSetContext(
      { ...result(), id: sessionSlotId(added, 0), itemId: other, exercisePosition: null },
      added,
      parent(),
    ),
  ).toBeNull();
  for (const patch of [
    { id: other },
    { originalPosition: 1 },
    { sessionId: other },
    { reason: 'x'.repeat(501) },
    { extra: true },
    { exercise: { ...item().exercise, exerciseId: 'Different_exercise' } },
  ]) {
    expect(validateSessionItem({ ...item(), ...patch }, parent())).not.toBeNull();
  }
  expect(
    validateSessionItem({ ...item(), origin: 'added', originalPosition: null }, parent()),
  ).not.toBeNull();
});

it('rejects malformed result metadata and foreign, mismatched or out-of-time contexts', () => {
  expect(validateStableSetRecord(result())).toBeNull();
  expect(validateStableSetContext(result(), item(), parent())).toBeNull();
  for (const patch of [
    { itemId: null },
    { side: 'left' },
    { targetsAtPerformance: null },
    { values: {} },
    { values: { time: 30 } },
    { setIndex: 3 },
    { exercisePosition: -1 },
    { targetsAtPerformance: { ...result().targetsAtPerformance, targetReps: 0 } },
    { extra: true },
  ]) {
    expect(validateStableSetRecord({ ...result(), ...patch })).not.toBeNull();
  }
  for (const patch of [
    { id: other },
    { itemId: other },
    { sessionId: other },
    { exercisePosition: null },
    { loggedAt: at(-1).toISOString() },
  ]) {
    expect(validateStableSetContext({ ...result(), ...patch }, item(), parent())).not.toBeNull();
  }
  expect(
    validateStableSetContext(result(), item(), {
      ...parent(),
      endedAt: at(0).toISOString(),
      status: 'completed',
    }),
  ).not.toBeNull();
});

it('preserves performed work when current items are removed, reduced or change future fields', () => {
  const performed: StableSetLog = { ...result(), id: sessionSlotId(item(), 2), setIndex: 2 };
  for (const state of ['skipped', 'removed'] as const) {
    const changed: SessionItem = {
      ...item(),
      state,
      deletedAt: at(2).toISOString(),
      exercise: { ...item().exercise, sets: 1, logFields: ['notes'] },
    };
    expect(validateStableSetContext(performed, changed, parent())).toBeNull();
    expect(performed.targetsAtPerformance.sets).toBe(3);
  }
});

it('keeps full variant validators strict while sharing one item context across result reads', () => {
  const legacy = { ...set(), id: sessionSlotId(item(), 0), updatedAt: at(1).toISOString() };
  expect(validateLegacySetContext(legacy, item(), parent())).toBeNull();
  expect(
    validateLegacySetContext({ ...result(), exercisePosition: 0 }, item(), parent()),
  ).not.toBeNull();
  expect(validateStableSetContext(legacy as StableSetLog, item(), parent())).not.toBeNull();
});
