// Session reminders on chosen training days — weekly local notifications.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface ReminderSettings {
  weekdays: number[]; // 1 (Sunday) – 7 (Saturday), expo convention
  hour: number;
}

const STORAGE_KEY = 'profit.reminders';
const CHANNEL_ID = 'training-reminders';

export const WEEKDAY_LABELS: Record<number, string> = {
  2: 'Mon', 3: 'Tue', 4: 'Wed', 5: 'Thu', 6: 'Fri', 7: 'Sat', 1: 'Sun',
};

export async function loadReminderSettings(): Promise<ReminderSettings | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReminderSettings;
  } catch {
    return null;
  }
}

/**
 * Replace all scheduled reminders with the given settings. Returns false when
 * the user denied notification permission (caller shows the state).
 */
export async function applyReminders(
  settings: ReminderSettings,
): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;

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
  return true;
}

export async function clearReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.removeItem(STORAGE_KEY);
}
