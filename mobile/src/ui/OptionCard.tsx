import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { AppText } from './AppText';

type Props = {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
};

// One choice in a single-choice list. Selection shows as a terracotta border and a check, not
// colour alone, so it reads for everyone.
export function OptionCard({ label, description, selected, onPress }: Props) {
  const { colors, radius, space } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: touchTarget + 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: selected ? colors.accent : colors.line,
        backgroundColor: pressed ? colors.surface2 : colors.surface,
      })}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{label}</AppText>
        {description ? <AppText variant="caption" color="text2">{description}</AppText> : null}
      </View>
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? colors.accent : colors.text2} />
    </Pressable>
  );
}
