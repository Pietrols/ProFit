import { router } from 'expo-router';
import { View } from 'react-native';
import { formatHomeDate, greetingFor } from '@/features/home/greeting';
import { HubTile } from '@/features/home/HubTile';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';

export default function HomeScreen() {
  const { space } = useAppTheme();
  const now = new Date();

  return (
    <Screen eyebrow={formatHomeDate(now)} title={greetingFor(now.getHours())}>
      <Card>
        <AppText variant="label" color="accent">Today</AppText>
        <AppText variant="title">No plan yet</AppText>
        <AppText color="text2">
          Start with a ready-made plan or build your own. Your next session will show up here.
        </AppText>
        <Button label="Choose a plan" onPress={() => router.navigate('/train')} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} />
      </Card>

      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <HubTile icon="barbell-outline" label="Workouts" value="0" hint="sessions this week" onPress={() => router.navigate('/train')} />
          <HubTile icon="restaurant-outline" label="Meals" value="0" hint="kcal logged today" onPress={() => router.navigate('/food')} />
        </View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <HubTile icon="stats-chart-outline" label="Progress" value="0" hint="day streak" onPress={() => router.push('/progress')} />
          <HubTile icon="chatbubble-ellipses-outline" label="Coach" value="Ask" hint="your training coach" onPress={() => router.push('/coach')} />
        </View>
      </View>
    </Screen>
  );
}
