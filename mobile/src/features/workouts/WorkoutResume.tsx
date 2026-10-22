import { router } from 'expo-router';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { useWorkoutOverview } from './useWorkoutOverview';

export function WorkoutResume() {
  const query = useWorkoutOverview(null);
  if (!query.data && !query.error)
    return <AppText color="text2">Checking saved active workouts.</AppText>;
  if (query.error)
    return (
      <Card>
        <AppText color="caution">Could not read active workouts: {query.error}</AppText>
        <Button label="Retry active workouts" onPress={query.retry} />
      </Card>
    );
  if (!query.data?.active.length) return null;
  return (
    <Card>
      <AppText variant="title">Resume</AppText>
      {query.data.active.map((session) => (
        <Button
          key={session.id}
          label={`Resume ${session.snapshot.dayName}`}
          onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: session.id } })}
        />
      ))}
      {query.data.hasMoreActive ? (
        <AppText color="text2">
          Finish or abandon these active workouts to see more saved sessions.
        </AppText>
      ) : null}
    </Card>
  );
}
