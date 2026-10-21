import { Pressable, View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { AppText } from './AppText';

type Props<T> = {
  label: string;
  options: { value: T; label: string }[];
  values: T[];
  onToggle: (value: T) => void;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
};

// Several choices from short options (muscles). Each chip turns on and off; the caller decides limits.
export function MultiChipGroup<T extends string>({
  label,
  options,
  values,
  onToggle,
  hint,
  error,
  disabled = false,
}: Props<T>) {
  const { colors, radius, space } = useAppTheme();
  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="label" color="text2">
        {label}
      </AppText>
      <View
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}
      >
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => onToggle(option.value)}
              style={({ pressed }) => ({
                minHeight: touchTarget - 4,
                opacity: disabled ? 0.45 : 1,
                paddingHorizontal: space.lg,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: selected ? colors.accent : colors.line,
                backgroundColor: selected
                  ? colors.accent
                  : pressed
                    ? colors.surface2
                    : colors.surface,
              })}
            >
              <AppText
                variant="bodyStrong"
                style={{ color: selected ? colors.onAccent : colors.text }}
              >
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <AppText variant="caption" color="caution" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="text2">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
