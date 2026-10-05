import { Text, type TextProps } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { ColorTokens, TypeVariant } from '@/theme/tokens';

type Props = TextProps & {
  variant?: TypeVariant;
  color?: keyof ColorTokens;
};

// The only text component screens use, so every string follows the type scale and palette.
export function AppText({ variant = 'body', color = 'text', style, ...rest }: Props) {
  const { colors, type } = useAppTheme();
  return <Text {...rest} style={[type[variant], { color: colors[color] }, style]} />;
}
