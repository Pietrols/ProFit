import { router } from 'expo-router';
import { View } from 'react-native';
import { useExerciseLibrary } from '@/features/exercises/useExerciseLibrary';
import { activePlan, targetSummary, todaysDay } from '@/features/plans/logic';
import { PlanState } from '@/features/plans/PlanState';
import { usePlans } from '@/features/plans/usePlans';
import { localDay } from '@/lib/dates';
import { useMe } from '@/features/auth/AuthProvider';
import { formatHomeDate, greetingFor } from '@/features/home/greeting';
import { SyncBanner } from '@/features/sync/SyncBanner';
import { HubTile } from '@/features/home/HubTile';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';

export default function HomeScreen() {
  const { space } = useAppTheme();
  const { me } = useMe();
  const now = new Date();
  const plans = usePlans(); const library = useExerciseLibrary();
  if (plans.error || library.error || !plans.data || !library.exercises) return <PlanState error={plans.error ?? library.error} retry={() => { plans.retry(); library.retry(); }} />;
  const plan = activePlan(plans.data.plans);
  const day = plan ? todaysDay(plan, plans.data.days, null, localDay(now)) : null;
  const exercises = plans.data.exercises.filter((e) => e.dayId === day?.id);

  return (
    <Screen eyebrow={formatHomeDate(now)} title={greetingFor(now.getHours(), me?.user.displayName)}>
      <SyncBanner />
      <Card>
        <AppText variant="label" color="accent">Today</AppText>
        <AppText variant="title">{plan ? (day?.name ?? 'Rest day') : 'No active plan'}</AppText>
        {plan ? <>
          <AppText color="text2">{plan.name} · {plan.difficulty}</AppText>
          {!day || day.restDay ? <AppText color="text2">No training scheduled today. Your daily habit is still here.</AppText> : <>
            {!exercises.length ? <AppText color="text2">Add exercises and targets to this day.</AppText> : exercises.map((exercise) => <View key={exercise.id}><AppText variant="bodyStrong">{library.find(exercise.exerciseId)?.name ?? 'Exercise no longer in your library'}</AppText><AppText color="text2">{targetSummary(exercise, plan.difficulty)}</AppText></View>)}
            <AppText variant="caption" color="text2">Guided session logging is coming next. Your plan is saved and ready.</AppText>
          </>}
          <Button label="View today's day" onPress={() => day ? router.push({ pathname: '/plans/day', params: { id: day.id } }) : router.push({ pathname: '/plans/form', params: { id: plan.id } })} />
        </> : <><AppText color="text2">Choose a starter plan or make your own. Activate it to see your next day here.</AppText><Button label="Pick a starter plan" onPress={() => router.push('/plans')} /></>}
      </Card>

      <Card><AppText variant="label" color="accent2">Every day</AppText><AppText variant="title">Daily habit</AppText>
        {plans.data.habit.length ? plans.data.habit.map((id, index) => <AppText key={`${index}/${id}`}>{library.find(id)?.name ?? 'Exercise no longer in your library'}</AppText>) : <AppText color="text2">Add exercises for a routine you want to see every day.</AppText>}
        <Button label="Edit daily habit" variant="secondary" onPress={() => router.push('/plans/habit')} />
      </Card>
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <HubTile icon="barbell-outline" label="Workouts" value={String(plans.data.plans.length)} hint="saved plans" onPress={() => router.navigate('/train')} />
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
