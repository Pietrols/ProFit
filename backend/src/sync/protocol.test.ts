import { expect, it } from 'vitest';
import { requireSyncProtocol, SYNC_CAPABILITIES } from './protocol.js';

it('keeps legacy transport working during preparation without advertising structural writes', () => {
  expect(SYNC_CAPABILITIES).toEqual({ protocols: [1, 2], minimumProtocol: 1, features: [] });
  expect(() => requireSyncProtocol(1)).not.toThrow();
  expect(() => requireSyncProtocol(2)).not.toThrow();
});

it('rejects unsupported or below-minimum versions as a whole-request upgrade error', () => {
  for (const protocol of [0, 3, NaN, null, '2']) {
    expect(() => requireSyncProtocol(protocol)).toThrow(
      expect.objectContaining({
        status: 426,
        code: 'SYNC_UPGRADE_REQUIRED',
      }),
    );
  }
  const cutover = { ...SYNC_CAPABILITIES, minimumProtocol: 2 };
  expect(() => requireSyncProtocol(1, cutover)).toThrow(expect.objectContaining({ status: 426 }));
  expect(() => requireSyncProtocol(2, cutover)).not.toThrow();
});
