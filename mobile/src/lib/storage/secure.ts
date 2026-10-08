// Storage for secrets (the sign-in tokens), web preview version.
// The browser has no secure keystore, so the preview keeps tokens in localStorage. Only the
// development preview runs here; phones use secure.native.ts (Android Keystore, iOS Keychain).

export const secureStorage = {
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
