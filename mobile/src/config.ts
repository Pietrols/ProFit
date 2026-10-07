// Build-time settings from mobile/.env. Expo only inlines an EXPO_PUBLIC_ variable when the code
// reads it by its full name, so each one is read literally here and nowhere else.

export const config = {
  // Where the app finds the API, without a trailing slash.
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, ''),
  // Google OAuth Web client ID. Android Credential Manager asks Google for ID tokens issued to it.
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  // "Developer sign-in" button: development builds only, and only when switched on.
  devLogin: __DEV__ && process.env.EXPO_PUBLIC_DEV_LOGIN === 'true',
};
