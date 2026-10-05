import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors, radius, space } = useAppTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.line,
          padding: space.lg,
          gap: space.sm,
        },
        style,
      ]}>
      {children}
    </View>
  );
}
