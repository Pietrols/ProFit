// Configurable local reminders (Group C): a training-day reminder (chosen
// weekdays + time) and a meal-logging reminder (daily at a chosen time).
//
// expo-notifications must NOT be imported at module top level: since SDK 53
// its module evaluation registers a push-token listener that crashes inside
// Expo Go. We gate on the execution environment and lazy-import the module
// only when reminders are actually applied (dev/production builds).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import {
  DEFAULT_REMINDERS,
  MEAL_REMINDER_ID,
  mergeReminderSettings,
  ReminderSettings,
  STORAGE_KEY,
} from './reminderModel';

export type {
  ReminderSettings,
  TimeOfDay,
} from './reminderModel';
export { formatTime, WEEKDAY_LABELS } from './reminderModel';
export { DEFAULT_REMINDERS, MEAL_REMINDER_ID };

export type ReminderResult = 'ok' | 'denied' | 'unsupported';

const CHANNEL_ID = 'training-reminders';

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

export async function loadReminderSettings(): Promise<ReminderSettings> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_REMINDERS;
  try {
    return mergeReminderSettings(JSON.parse(raw) as Partial<ReminderSettings>);
  } catch {
    return DEFAULT_REMINDERS;
  }
}

async function ensureAndroidChannel(
  Notifications: NonNullable<Awaited<ReturnType<typeof getNotifications>>>,
) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'ProFit reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

/**
 * Replace all scheduled reminders with the given settings. These are
 * persisted by the OS scheduler, so they survive a force-quit / reboot.
 */
export async function applyReminders(
  settings: ReminderSettings,
): Promise<ReminderResult> {
  const Notifications = await getNotifications();
  if (!Notifications) {
    // Still persist the choice so it takes effect in a real build.
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return 'unsupported';
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return 'denied';
  await ensureAndroidChannel(Notifications);

  await Notifications.cancelAllScheduledNotificationsAsync();
  const channelId = Platform.OS === 'android' ? CHANNEL_ID : undefined;

  if (settings.training.enabled) {
    for (const weekday of settings.training.weekdays) {
      await Notifications.scheduleNotificationAsync({
        identifier: `training-${weekday}`,
        content: {
          title: 'Training day',
          body: "Your session is planned for today — even a short one counts.",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: settings.training.time.hour,
          minute: settings.training.time.minute,
          channelId,
        },
      });
    }
  }

  if (settings.meal.enabled) {
    await Notifications.scheduleNotificationAsync({
      identifier: MEAL_REMINDER_ID,
      content: {
        title: 'Log your meals',
        body: "Jot down what you ate today — a few taps keeps your log honest.",
        data: { kind: 'meal' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: settings.meal.time.hour,
        minute: settings.meal.time.minute,
        channelId,
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
