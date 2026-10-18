import type { RestPort } from './restAlerts';

// Web previews do not offer native scheduled alerts.
export const restPort: RestPort = {
  list: async () => [], cancel: async () => {}, permitted: async () => false,
  schedule: async () => { throw new Error('Background rest alerts need an Android or iOS build.'); },
};
export async function enableRestAlerts(): Promise<void> {
  throw new Error('Background rest alerts need an Android or iOS build.');
}
