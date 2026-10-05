import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';

export default function ProgressScreen() {
  return (
    <Screen>
      <EmptyState
        icon="stats-chart-outline"
        title="No progress to show yet"
        message="Charts for your weight, strength, training volume and meals appear once you start logging."
      />
    </Screen>
  );
}
