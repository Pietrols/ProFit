import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';

export default function CoachScreen() {
  return (
    <Screen>
      <EmptyState
        icon="chatbubble-ellipses-outline"
        title="Coach is not set up yet"
        message="Your coach will build plans with you, review what you log and answer training questions. Every change waits for your approval."
      />
    </Screen>
  );
}
