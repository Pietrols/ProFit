import { randomUUID } from 'expo-crypto';

// A random UUID (version 4) for new records, from the phone's secure random source.
export function randomId(): string {
  return randomUUID();
}
