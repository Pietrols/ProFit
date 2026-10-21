import { AppText } from '@/ui/AppText';
import { formatTimer, sessionClock } from './timers';
import { useWorkoutClock } from './useWorkoutClock';

export function SessionClock({
  startedAt,
  endedAt,
}: {
  startedAt: string;
  endedAt: string | null;
}) {
  const now = useWorkoutClock(endedAt === null);
  return (
    <AppText variant="display">
      {formatTimer(sessionClock(Date.parse(startedAt), endedAt ? Date.parse(endedAt) : null, now))}
    </AppText>
  );
}
