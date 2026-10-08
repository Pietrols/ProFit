import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

type Props = {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  scroll?: boolean;
};

// Standard screen frame: themed background, safe-area top inset, side padding, optional title.
export function Screen({ title, eyebrow, children, scroll = true }: Props) {
  const { colors, space } = useAppTheme();
  const body = (
    <View style={{ gap: space.lg, paddingHorizontal: space.lg, paddingBottom: space.xxl }}>
      {(title || eyebrow) && (
        <View style={{ gap: space.xs, paddingTop: space.md }}>
          {eyebrow ? <AppText variant="label" color="text2">{eyebrow}</AppText> : null}
          {title ? <AppText variant="display" accessibilityRole="header">{title}</AppText> : null}
        </View>
      )}
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: colors.bg }]}>
      {scroll ? <ScrollView contentContainerStyle={styles.grow}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
});
