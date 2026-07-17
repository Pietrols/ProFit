import { createContext, useContext } from 'react';

// Lets any screen (Profile's "Revisit setup") reopen the onboarding wizard.
// Provided by RootNav, which owns whether the wizard is showing.
export const OnboardingContext = createContext<{ open: () => void }>({
  open: () => {},
});

export function useOnboarding() {
  return useContext(OnboardingContext);
}
