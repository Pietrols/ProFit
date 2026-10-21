import { expect, it } from 'vitest';
import { requireSyncProtocol, SYNC_CAPABILITIES } from './protocol.js';

it('advertises structural compatibility only over the supported minimum protocol', () => {
  expect(SYNC_CAPABILITIES).toEqual({
    protocols: [1, 2],
    minimumProtocol: 2,
    features: ['workout_structure_v1'],
  });
  expect(() => requireSyncProtocol(1)).toThrow(expect.objectContaining({ status: 426 }));
  expect(() => requireSyncProtocol(2)).not.toThrow();
});

it('rejects unsupported or below-minimum versions as a whole-request upgrade error', () => {
  for (const protocol of [0, 1, 3, NaN, null, '2']) {
    expect(() => requireSyncProtocol(protocol)).toThrow(
      expect.objectContaining({
        status: 426,
        code: 'SYNC_UPGRADE_REQUIRED',
      }),
    );
  }
  const earlierServer = { ...SYNC_CAPABILITIES, minimumProtocol: 1, features: [] };
  expect(() => requireSyncProtocol(1, earlierServer)).not.toThrow();
});
