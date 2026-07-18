import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Resolve the backend URL in dev without hand-editing an IP on every network
// change. Priority:
//   1. EXPO_PUBLIC_API_URL if you set it explicitly (production builds).
//   2. The IP the phone actually used to reach Metro (from expo-constants) —
//      the backend runs on that same machine, so :4000 there is reachable.
//   3. Android-emulator loopback fallback.
function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;

  // TLS enforcement (AUDIT S4): production builds must talk https — bearer
  // tokens and health data never cross the wire in plain http outside dev.
  if (!__DEV__) {
    if (!explicit?.startsWith('https://')) {
      throw new Error(
        'Production builds require EXPO_PUBLIC_API_URL to be an https:// URL.',
      );
    }
    return explicit;
  }
  if (explicit) return explicit;

  // e.g. "10.147.243.79:8081" — the host+port of the Metro dev server.
  const hostUri =
    Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;

  const host = typeof hostUri === 'string' ? hostUri.split(':')[0] : null;
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:4000`;
  }

  // No Metro host (production, or a weird environment): emulator loopback.
  return Platform.OS === 'android'
    ? 'http://10.0.2.2:4000'
    : 'http://localhost:4000';
}

export const BASE_URL = resolveBaseUrl();
