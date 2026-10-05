import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';
import { Button } from './Button';

type Props = {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

// What a screen shows before there is anything in it: what will appear here, and how to start.
export function EmptyState({ icon, title, message, actionLabel, onAction }: Props) {
  const { colors, space } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxxl, paddingHorizontal: space.lg }}>
      <Ionicons name={icon} size={40} color={colors.text2} />
      <AppText variant="title" style={{ textAlign: 'center' }}>{title}</AppText>
      <AppText color="text2" style={{ textAlign: 'center', maxWidth: 320 }}>{message}</AppText>
      {actionLabel ? <Button label={actionLabel} onPress={onAction} disabled={!onAction} /> : null}
    </View>
  );
}
