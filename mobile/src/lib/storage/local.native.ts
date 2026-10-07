import Storage from 'expo-sqlite/kv-store';

// Small key-value storage for cached data (the profile and its unsent changes), kept in a SQLite
// file on the phone. Phase 2 replaces this with the full on-device store and sync engine.

export const kvStore = {
  getItem: (key: string) => Storage.getItemAsync(key),
  setItem: (key: string, value: string) => Storage.setItemAsync(key, value),
  async removeItem(key: string): Promise<void> {
    await Storage.removeItemAsync(key);
  },
};
