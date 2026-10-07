import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  statusCodes,
} from 'react-native-nitro-google-signin';
import { config } from '@/config';

// Google sign-in on Android (Credential Manager) and iOS (Google Sign-In SDK).
// Same exports as google.ts; see docs/GOOGLE_SIGN_IN.md for the Google Cloud setup it needs.

export const googleSignInAvailable = config.googleWebClientId.length > 0;

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!googleSignInAvailable) {
    throw new Error('Google sign-in is not set up in this build. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to mobile/.env.');
  }
  GoogleOneTapSignIn.configure({ webClientId: config.googleWebClientId });
  configured = true;
}

// Resolves with Google's ID token, or null when the user closed the account picker.
// Tries the quiet path first (an account already used with ProFit), then the full account list.
export async function getGoogleIdToken(): Promise<string | null> {
  ensureConfigured();
  try {
    await GoogleOneTapSignIn.checkPlayServices();
    let response = await GoogleOneTapSignIn.signIn();
    if (isNoSavedCredentialFoundResponse(response)) response = await GoogleOneTapSignIn.createAccount();
    if (isNoSavedCredentialFoundResponse(response)) response = await GoogleOneTapSignIn.presentExplicitSignIn();
    if (isCancelledResponse(response)) return null;
    if (isSuccessResponse(response)) return response.data.idToken;
    throw new Error('Google did not return an account. Try again.');
  } catch (error) {
    throw new Error(describeGoogleError(error));
  }
}

export async function signOutOfGoogle(): Promise<void> {
  if (!configured) return;
  try {
    await GoogleOneTapSignIn.signOut();
  } catch {
    // Signing out of ProFit does not depend on this; it only resets Google's account choice.
  }
}

function describeGoogleError(error: unknown): string {
  if (!isErrorWithCode(error)) return error instanceof Error ? error.message : 'Google sign-in failed. Try again.';
  switch (error.code) {
    case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
      return 'Google Play services is missing or out of date on this phone. Update it and try again.';
    case statusCodes.SIGN_IN_CANCELLED:
      return 'Sign-in was cancelled.';
    case statusCodes.DEVELOPER_ERROR:
      return 'Google sign-in is not set up for this build (check the SHA-1 and client IDs in docs/GOOGLE_SIGN_IN.md).';
    default:
      return 'Google sign-in failed. Try again.';
  }
}
