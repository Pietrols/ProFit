import { expect, it } from 'vitest';
import { setLogId } from '../identity';
import { plannedItemId, sessionSlotId } from '../structureIdentity';
import { sessionId } from './fixtures';

const item = (originalPosition = 0) => ({
  id: plannedItemId(sessionId, originalPosition),
  sessionId,
  origin: 'planned' as const,
  originalPosition,
  position: originalPosition,
});

it('preserves every legacy slot id and keeps identity independent of exercise display order', () => {
  expect(item().id).toBe('dc0535d2-4069-50fb-b8f0-d924b2a39d06');
  for (const position of [0, 1, 99]) {
    const original = item(position);
    const reordered = { ...original, position: 9999 };
    for (const slot of [0, 1, 99]) {
      expect(sessionSlotId(original, slot)).toBe(setLogId(sessionId, position, slot));
      expect(sessionSlotId(reordered, slot)).toBe(sessionSlotId(original, slot));
    }
  }
  expect(sessionSlotId(item(0), 0)).not.toBe(sessionSlotId(item(1), 0));
});

it('gives independent added/replacement occurrences their own stable namespace', () => {
  const added = {
    id: '00000000-0000-4000-8000-000000000004',
    sessionId,
    origin: 'added' as const,
    originalPosition: null,
  };
  const replacement = {
    ...added,
    id: '00000000-0000-4000-8000-000000000005',
    origin: 'replacement' as const,
  };
  expect(sessionSlotId(added, 0)).toBe('a3b5b5e6-aca0-5707-b8c2-3186eba06b4b');
  expect(sessionSlotId(added, 0)).not.toBe(sessionSlotId(added, 1));
  expect(sessionSlotId(added, 0)).not.toBe(sessionSlotId(replacement, 0));
  expect(sessionSlotId(added, 0)).not.toBe(setLogId(sessionId, 0, 0));
});

it('rejects invalid namespaces, changed planned identities and unstable slot indexes', () => {
  for (const slot of [-1, 0.5, 100, NaN]) expect(() => sessionSlotId(item(), slot)).toThrow();
  for (const position of [-1, 0.5, 100, NaN])
    expect(() => plannedItemId(sessionId, position)).toThrow();
  expect(() => plannedItemId('invalid', 0)).toThrow();
  expect(() => sessionSlotId({ ...item(), originalPosition: 1 }, 0)).toThrow('original identity');
  expect(() => sessionSlotId({ ...item(), id: 'invalid' }, 0)).toThrow();
});
