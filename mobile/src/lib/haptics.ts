// Haptic + vibration cues (AUDIT U5/M1). Every call is fire-and-forget and
// swallows failures — feedback must never break a workout on devices without
// a haptic engine.
import * as Haptics from 'expo-haptics';
import { Vibration } from 'react-native';

/** Light tick — set completed, chip toggled. */
export function tapFeedback() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Success — workout finished, new personal record. */
export function successFeedback() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/**
 * Rest timer done — strong enough to feel with the phone on a bench:
 * double vibration burst plus a haptic, so it lands whether or not the
 * screen is being watched.
 */
export function restDoneFeedback() {
  Vibration.vibrate([0, 400, 200, 400]);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
