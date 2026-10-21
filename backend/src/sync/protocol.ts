import { AppError } from '../lib/errors.js';

export type SyncCapabilities = {
  protocols: readonly number[];
  minimumProtocol: number;
  features: readonly string[];
};

// Old clients must upgrade before consuming structural records or advancing their cursor (D42).
export const SYNC_CAPABILITIES: SyncCapabilities = {
  protocols: [1, 2],
  minimumProtocol: 2,
  features: ['workout_structure_v1'],
};

export function requireSyncProtocol(protocol: unknown, capabilities = SYNC_CAPABILITIES): void {
  if (
    typeof protocol !== 'number' ||
    !capabilities.protocols.includes(protocol) ||
    protocol < capabilities.minimumProtocol
  )
    throw new AppError(
      426,
      'SYNC_UPGRADE_REQUIRED',
      'Update ProFit to resume sync. Your changes are still saved on this phone.',
    );
}
