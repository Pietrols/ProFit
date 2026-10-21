import { expect, it } from 'vitest';
import { ApiError, NetworkError } from '../../../lib/api/errors';
import { checkSyncCapabilities, negotiateSync } from '../protocol';

const capabilities = { protocols: [1, 2], minimumProtocol: 1, features: [] };
it('accepts negotiated legacy data but requires every requested new-format capability', () => {
  expect(() => checkSyncCapabilities(capabilities)).not.toThrow();
  expect(() => checkSyncCapabilities(capabilities, ['workout_structure_v1'])).toThrow(
    expect.objectContaining({ code: 'SYNC_SERVER_UPGRADE_REQUIRED' }),
  );
  expect(() =>
    checkSyncCapabilities({ ...capabilities, features: ['workout_structure_v1'] }, [
      'workout_structure_v1',
    ]),
  ).not.toThrow();
});

it('distinguishes an outdated app from an outdated or malformed server response', () => {
  expect(() => checkSyncCapabilities({ protocols: [3], minimumProtocol: 3, features: [] })).toThrow(
    expect.objectContaining({ code: 'SYNC_UPGRADE_REQUIRED' }),
  );
  for (const value of [
    null,
    [],
    {},
    { ...capabilities, protocols: [1] },
    { ...capabilities, protocols: ['2'] },
    { ...capabilities, minimumProtocol: 0 },
    { ...capabilities, features: [42] },
  ]) {
    expect(() => checkSyncCapabilities(value)).toThrow(
      expect.objectContaining({
        code: 'SYNC_SERVER_UPGRADE_REQUIRED',
      }),
    );
  }
});

it('maps a missing old-server endpoint to an upgrade message and preserves connection/auth failures', async () => {
  for (const error of [new NetworkError(), new ApiError(401, 'UNAUTHENTICATED', 'Sign in')]) {
    await expect(
      negotiateSync({
        get: async () => {
          throw error;
        },
      }),
    ).rejects.toBe(error);
  }
  await expect(
    negotiateSync({
      get: async () => {
        throw new ApiError(404, 'NOT_FOUND', 'Not found');
      },
    }),
  ).rejects.toMatchObject({
    code: 'SYNC_SERVER_UPGRADE_REQUIRED',
  });
});
