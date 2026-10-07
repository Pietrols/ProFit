// Google sign-in for platforms without the native module (the web preview).
// The real implementation is google.native.ts, which Metro picks on Android and iOS.

export const googleSignInAvailable = false;

// Resolves with Google's ID token, or null when the user closed the account picker.
export async function getGoogleIdToken(): Promise<string | null> {
  throw new Error('Google sign-in works in the Android and iOS app, not in the web preview.');
}

// Forgets the Google account picked on this phone, so the next sign-in can choose another.
export async function signOutOfGoogle(): Promise<void> {}
