import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { RestPort, RestRequest } from './restAlerts';

const marker = 'profit-rest-v1';
const channelId = 'workout-rest';
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const ours = notification.request.content.data?.kind === marker;
    return { shouldPlaySound: ours, shouldSetBadge: false, shouldShowBanner: ours, shouldShowList: ours };
  },
});
async function channel() {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(channelId, {
    name: 'Workout rest alerts', importance: Notifications.AndroidImportance.HIGH, sound: 'default',
  });
}
function granted(permission: Notifications.NotificationPermissionsStatus): boolean {
  return Platform.OS === 'ios'
    ? permission.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
    : permission.granted;
}
export async function enableRestAlerts(): Promise<void> {
  await channel();
  const current = await Notifications.getPermissionsAsync();
  const permission = granted(current) || !current.canAskAgain ? current
    : await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  if (!granted(permission)) throw new Error('Background alerts are off. Allow notifications in your phone settings, then try again.');
}
export const restPort: RestPort = {
  async list() {
    const result: RestRequest[] = [];
    for (const request of await Notifications.getAllScheduledNotificationsAsync()) {
      const data = request.content.data;
      if (data?.kind !== marker) continue;
      // Invalid tagged requests are cancelled during reconciliation as unowned records.
      result.push({ id: request.identifier, user: typeof data.user === 'string' ? data.user : '',
        session: typeof data.session === 'string' ? data.session : '',
        generation: typeof data.generation === 'string' ? data.generation : '',
        at: typeof data.at === 'number' ? data.at : 0 });
    }
    return result;
  },
  cancel: Notifications.cancelScheduledNotificationAsync,
  permitted: async () => granted(await Notifications.getPermissionsAsync()),
  async schedule(request) {
    await channel();
    return Notifications.scheduleNotificationAsync({
      content: { title: 'Rest complete', body: 'Ready for your next set.', sound: 'default',
        data: { kind: marker, ...request } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(request.at), channelId },
    });
  },
};
