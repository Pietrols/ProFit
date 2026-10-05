import { Pressable, type PressableProps } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { AppText } from './AppText';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: 'primary' | 'secondary';
};

export function Button({ label, variant = 'primary', disabled, style, ...rest }: Props) {
  const { colors, radius, space } = useAppTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      {...rest}
      style={(state) => [
        {
          minHeight: touchTarget,
          paddingHorizontal: space.xl,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: primary ? colors.accent : colors.surface2,
          opacity: disabled ? 0.45 : state.pressed ? 0.85 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}>
      <AppText variant="bodyStrong" style={{ color: primary ? colors.onAccent : colors.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}
