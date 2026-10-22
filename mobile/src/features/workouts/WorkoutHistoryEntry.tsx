import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { formatTimer, sessionClock } from './timers';
import type { WorkoutHistoryPage } from './workoutHistory';

export function WorkoutHistoryEntry({
  entry,
  open,
  filterPlan,
}: {
  entry: WorkoutHistoryPage['entries'][number];
  open: () => void;
  filterPlan: () => void;
}) {
  const { session, savedResults } = entry;
  const ended = session.endedAt ? Date.parse(session.endedAt) : null;
  return (
    <Card>
      <AppText variant="title">{session.snapshot.dayName}</AppText>
      <AppText color="text2">
        {session.localDate} · {session.snapshot.planName}
      </AppText>
      <AppText>
        {session.snapshot.restDay ? `Rest day, ${session.status}` : session.status} · {savedResults}{' '}
        saved results
      </AppText>
      {!session.snapshot.restDay && ended !== null ? (
        <AppText color="text2">
          Duration: {formatTimer(sessionClock(Date.parse(session.startedAt), ended, ended))}
        </AppText>
      ) : null}
      <AppText variant="caption" color="text2">
        Saved results include incomplete entries. Open the workout for completion, targets, records
        and corrections.
      </AppText>
      <Button label={`Open ${session.snapshot.dayName} on ${session.localDate}`} onPress={open} />
      <Button
        label={`History for ${session.snapshot.planName}`}
        variant="secondary"
        onPress={filterPlan}
      />
    </Card>
  );
}
