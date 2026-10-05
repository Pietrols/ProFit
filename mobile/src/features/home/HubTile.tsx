import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';

type Props = {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  hint: string;
  onPress: () => void;
};

// One of the four doors on Home. Shows a single live figure so the hub doubles as a summary.
export function HubTile({ icon, label, value, hint, onPress }: Props) {
  const { colors, radius, space } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}, ${hint}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 148,
        backgroundColor: pressed ? colors.surface2 : colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.line,
        padding: space.lg,
        justifyContent: 'space-between',
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.sm,
            backgroundColor: colors.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Ionicons name={icon} size={20} color={colors.accent} />
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.text2} />
      </View>
      <View style={{ gap: 2 }}>
        <AppText variant="label" color="text2">{label}</AppText>
        <AppText variant="stat">{value}</AppText>
        <AppText variant="caption" color="text2" numberOfLines={1}>{hint}</AppText>
      </View>
    </Pressable>
  );
}
