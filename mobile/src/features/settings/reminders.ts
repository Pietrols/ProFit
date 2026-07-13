// Session reminders on chosen training days — weekly local notifications.
//
// expo-notifications must NOT be imported at module top level: since SDK 53
// its module evaluation registers a push-token listener that crashes inside
// Expo Go. We gate on the execution environment and lazy-import the module
// only when reminders are actually applied (dev/production builds).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

export interface ReminderSettings {
  weekdays: number[]; // 1 (Sunday) – 7 (Saturday), expo convention
  hour: number;
}

export type ReminderResult = 'ok' | 'denied' | 'unsupported';

const STORAGE_KEY = 'profit.reminders';
const CHANNEL_ID = 'training-reminders';

export const WEEKDAY_LABELS: Record<number, string> = {
  2: 'Mon', 3: 'Tue', 4: 'Wed', 5: 'Thu', 6: 'Fri', 7: 'Sat', 1: 'Sun',
};

const inExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

async function getNotifications() {
  if (inExpoGo) return null; // Expo Go: module evaluation itself crashes
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

export async function loadReminderSettings(): Promise<ReminderSettings | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReminderSettings;
  } catch {
    return null;
  }
}

/** Replace all scheduled reminders with the given settings. */
export async function applyReminders(
  settings: ReminderSettings,
): Promise<ReminderResult> {
  const Notifications = await getNotifications();
  if (!Notifications) return 'unsupported';

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return 'denied';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Training reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const weekday of settings.weekdays) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Training day',
        body: "Your session is planned for today — even a short one counts.",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour: settings.hour,
        minute: 0,
        channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
      },
    });
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  return 'ok';
}

export async function clearReminders(): Promise<void> {
  const Notifications = await getNotifications();
  if (Notifications) {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }
  await AsyncStorage.removeItem(STORAGE_KEY);
}
