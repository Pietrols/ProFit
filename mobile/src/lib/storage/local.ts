// Small key-value storage for cached data (the profile and its unsent changes), web preview version.
// Phones use local.native.ts. Phase 2 replaces this with the on-device SQLite store and sync engine.

export const kvStore = {
  async getItem(key: string): Promise<string | null> {
    return globalThis.localStorage?.getItem(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    globalThis.localStorage?.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    globalThis.localStorage?.removeItem(key);
  },
};
