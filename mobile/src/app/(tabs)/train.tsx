import { Screen } from '@/ui/Screen';
import { EmptyState } from '@/ui/EmptyState';

export default function TrainScreen() {
  return (
    <Screen title="Train">
      <EmptyState
        icon="barbell-outline"
        title="No workouts yet"
        message="Your plans, the exercise library and every session you log will live here."
      />
    </Screen>
  );
}
