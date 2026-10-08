import type { OnboardingStatus } from '../profile/types';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

// Which part of the app to show. The root layout turns this into Stack.Protected guards.
export type Area = 'loading' | 'signIn' | 'onboarding' | 'app';

// onboarding is null when the profile has not been loaded yet (for example a reinstall that kept
// the keystore but lost the cache, opened offline). That user goes to the app, not back through
// onboarding: they can finish their profile from You.
export function areaFor(status: AuthStatus, onboarding: OnboardingStatus | null): Area {
  if (status === 'loading') return 'loading';
  if (status === 'signedOut') return 'signIn';
  return onboarding === 'pending' ? 'onboarding' : 'app';
}
