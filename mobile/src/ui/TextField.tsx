import { TextInput, View, type TextInputProps } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { AppText } from './AppText';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  hint?: string;
  error?: string | null;
};

// A labelled text input. The label stays above the field so it is never lost once text is typed.
export function TextField({ label, hint, error, ...rest }: Props) {
  const { colors, radius, space, type } = useAppTheme();
  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="label" color="text2">{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.text2}
        selectionColor={colors.accent}
        {...rest}
        style={[
          type.body,
          {
            minHeight: touchTarget,
            color: colors.text,
            backgroundColor: colors.surface2,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: error ? colors.caution : 'transparent',
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
          },
        ]}
      />
      {error ? (
        <AppText variant="caption" color="caution" accessibilityLiveRegion="polite">{error}</AppText>
      ) : hint ? (
        <AppText variant="caption" color="text2">{hint}</AppText>
      ) : null}
    </View>
  );
}
