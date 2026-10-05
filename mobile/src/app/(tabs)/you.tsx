import { Pressable, View } from 'react-native';
import type { ThemePreference } from '@/theme/preference';
import { useAppTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Follow phone' },
];

export default function YouScreen() {
  const { colors, radius, space, preference, setPreference } = useAppTheme();

  return (
    <Screen title="You">
      <Card>
        <AppText variant="label" color="text2">Account</AppText>
        <AppText variant="bodyStrong">Not signed in</AppText>
        <AppText color="text2">Sign in with Google to back up your training and join the community.</AppText>
      </Card>

      <Card>
        <AppText variant="label" color="text2">Appearance</AppText>
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.pill, padding: space.xs }}>
          {THEME_OPTIONS.map((option) => {
            const selected = option.value === preference;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setPreference(option.value)}
                style={{
                  flex: 1,
                  minHeight: touchTarget - space.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.pill,
                  backgroundColor: selected ? colors.accent : 'transparent',
                }}>
                <AppText variant="bodyStrong" style={{ color: selected ? colors.onAccent : colors.text }}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}
