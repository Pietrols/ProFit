import { Pressable, View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { AppText } from './AppText';

type Chip<T> = { value: T; label: string };

type Props<T> = {
  label: string;
  options: Chip<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  // Tapping the selected chip again clears the choice. Off for fields that always need a value.
  clearable?: boolean;
  hint?: string;
};

// A compact single choice for short options (units, days per week). Wraps onto more lines as needed.
export function ChipGroup<T extends string | number>({ label, options, value, onChange, clearable = true, hint }: Props<T>) {
  const { colors, radius, space } = useAppTheme();
  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="label" color="text2">{label}</AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(selected && clearable ? null : option.value)}
              style={({ pressed }) => ({
                minHeight: touchTarget - 4,
                minWidth: touchTarget,
                paddingHorizontal: space.lg,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: selected ? colors.accent : colors.line,
                backgroundColor: selected ? colors.accent : pressed ? colors.surface2 : colors.surface,
              })}>
              <AppText variant="bodyStrong" style={{ color: selected ? colors.onAccent : colors.text }}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {hint ? <AppText variant="caption" color="text2">{hint}</AppText> : null}
    </View>
  );
}
