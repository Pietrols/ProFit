// A random UUID (version 4) for new records. This file is used in tests and the web preview, where
// the platform's crypto is available; phones use randomId.native.ts.
export function randomId(): string {
  return globalThis.crypto.randomUUID();
}
