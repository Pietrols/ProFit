import { router } from 'expo-router';
import { useState } from 'react';
import { useExerciseLibrary } from '@/features/exercises/useExerciseLibrary';
import { moveHabit } from '@/features/plans/logic';
import { PlanState } from '@/features/plans/PlanState';
import { usePlans } from '@/features/plans/usePlans';
import { SyncBanner } from '@/features/sync/SyncBanner';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
export default function HabitEditor() {
  const plans = usePlans(); const library = useExerciseLibrary(); const [failed, setFailed] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (plans.error || library.error || !plans.data || !library.exercises) return <PlanState error={plans.error ?? library.error} retry={() => { plans.retry(); library.retry(); }} />;
  const ids = plans.data.habit;
  async function save(next: string[]) { setBusy(true); setFailed(null); try { await plans.saveHabit(next); } catch (e) { setFailed(e instanceof Error ? e.message : 'Could not save the habit.'); } finally { setBusy(false); } }
  return <Screen title="Daily habit"><SyncBanner /><AppText color="text2">A routine outside your plan, shown every day. Completion logging arrives with workouts and streaks.</AppText>
    <Button label="Add habit exercise" disabled={busy} onPress={() => router.push({ pathname: '/exercises', params: { habit: '1' } })} />
    {failed ? <AppText color="caution" accessibilityLiveRegion="polite">{failed}</AppText> : null}
    {!ids.length ? <EmptyState icon="sunny-outline" title="No habit exercises yet" message="Pick exercises for a short routine you want to see every day." /> : null}
    {ids.map((id, index) => <Card key={`${index}/${id}`}><AppText variant="title">{library.find(id)?.name ?? 'Exercise no longer in your library'}</AppText>
      <Button label="Move up" disabled={busy || index === 0} variant="secondary" onPress={() => void save(moveHabit(ids, index, -1))} />
      <Button label="Move down" disabled={busy || index === ids.length - 1} variant="secondary" onPress={() => void save(moveHabit(ids, index, 1))} />
      <Button label="Remove from habit" disabled={busy} variant="secondary" onPress={() => void save(ids.filter((_, i) => i !== index))} />
    </Card>)}
  </Screen>;
}
