import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { useSyncStatus } from './SyncProvider';

// Says plainly when the app is working offline, or when the server refused something.
// Shows nothing while everything is in sync.
export function SyncBanner() {
  const { colors, radius, space } = useAppTheme();
  const { offline, pending, problem } = useSyncStatus();
  if (!offline && !problem) return null;

  const message = offline
    ? pending > 0
      ? `Offline. ${pending === 1 ? '1 change is' : `${pending} changes are`} saved on this phone and will sync when you reconnect.`
      : 'Offline. Everything you log is saved on this phone and syncs when you reconnect.'
    : problem;

  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        padding: space.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.caution,
        backgroundColor: colors.surface,
      }}>
      <Ionicons name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={20} color={colors.caution} />
      <AppText variant="caption" style={{ flex: 1 }}>{message}</AppText>
    </View>
  );
}
