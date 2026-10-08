import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';

export default function TrainScreen() {
  const { colors, space } = useAppTheme();
  const router = useRouter();
  return (
    <Screen title="Train">
      <Pressable accessibilityRole="button" accessibilityLabel="Exercise library. Search exercises and add your own." onPress={() => router.push('/exercises')} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Ionicons name="barbell-outline" size={28} color={colors.accent} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="bodyStrong">Exercise library</AppText>
            <AppText variant="caption" color="text2">Search 880 exercises, star favourites, add your own.</AppText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text2} />
        </Card>
      </Pressable>
      <Card>
        <AppText variant="label" color="text2">Plans and workouts</AppText>
        <AppText color="text2">Build a cycle or a weekly schedule and choose what to log.</AppText>
        <Button label="My plans" onPress={() => router.push('/plans')} />
      </Card>
    </Screen>
  );
}
