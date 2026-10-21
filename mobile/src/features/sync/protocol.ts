import type { ApiClient } from '../../lib/api/client';
import { ApiError } from '../../lib/api/errors';

export const SYNC_PROTOCOL = 2;
// Check before any upload, acknowledgement or pull can consume structural records (D42).
export const REQUIRED_SYNC_FEATURES: readonly string[] = ['workout_structure_v1'];
const serverUpgrade = () =>
  new ApiError(
    426,
    'SYNC_SERVER_UPGRADE_REQUIRED',
    'Update the ProFit server to resume sync. Your changes are still saved on this phone.',
  );
const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export function checkSyncCapabilities(value: unknown, required = REQUIRED_SYNC_FEATURES): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw serverUpgrade();
  const capabilities = value as Record<string, unknown>;
  const { protocols, minimumProtocol, features } = capabilities;
  if (
    !Array.isArray(protocols) ||
    !protocols.every(positiveInteger) ||
    !positiveInteger(minimumProtocol) ||
    !Array.isArray(features) ||
    !features.every((feature) => typeof feature === 'string')
  )
    throw serverUpgrade();
  if (minimumProtocol > SYNC_PROTOCOL)
    throw new ApiError(
      426,
      'SYNC_UPGRADE_REQUIRED',
      'Update ProFit to resume sync. Your changes are still saved on this phone.',
    );
  if (!protocols.includes(SYNC_PROTOCOL) || required.some((feature) => !features.includes(feature)))
    throw serverUpgrade();
}

export async function negotiateSync(api: Pick<ApiClient, 'get'>): Promise<void> {
  let capabilities: unknown;
  try {
    capabilities = await api.get('/sync/capabilities');
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw serverUpgrade();
    throw error;
  }
  checkSyncCapabilities(capabilities);
}
