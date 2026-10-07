import * as SecureStore from 'expo-secure-store';

// Storage for secrets (the sign-in tokens): Android Keystore and iOS Keychain via expo-secure-store.
// AFTER_FIRST_UNLOCK lets the app read its session after a restart without the phone being unlocked
// at that exact moment (for example when a notification wakes it).

const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key, options),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value, options),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key, options),
};
