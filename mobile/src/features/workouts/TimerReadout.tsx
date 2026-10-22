import { View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { formatTimer, timerView, type TimerState } from './timers';
import { useWorkoutClock } from './useWorkoutClock';

export function TimerReadout({
  timer,
  busy,
  pause,
  resume,
  compact = false,
}: {
  timer: TimerState | null;
  busy: boolean;
  pause: () => void;
  resume: () => void;
  compact?: boolean;
}) {
  const { space } = useAppTheme();
  const now = useWorkoutClock(timer !== null && timer.runningSince !== null);
  const view = timer ? timerView(timer, now) : null;
  return (
    <View
      style={{
        flexDirection: compact ? 'row' : 'column',
        flexWrap: 'wrap',
        alignItems: compact ? 'center' : 'stretch',
        gap: space.sm,
      }}
    >
      <View style={{ flexGrow: 1 }}>
        <AppText variant={compact ? 'stat' : 'display'}>
          {view
            ? formatTimer(view.remainingMs ?? view.elapsedMs, view.remainingMs !== null)
            : '0:00'}
        </AppText>
        {view ? (
          <AppText variant="caption" color="text2">
            {view.segment}
            {view.round !== null ? ` · Round ${view.round}` : ''}
            {timer?.runningSince === null && !view.done ? ' · Paused' : ''}
          </AppText>
        ) : null}
      </View>
      {timer && !view?.done ? (
        <Button
          label={timer.runningSince === null ? 'Resume timer' : 'Pause timer'}
          variant="secondary"
          disabled={busy || timer.config.mode === 'session'}
          onPress={timer.runningSince === null ? resume : pause}
        />
      ) : null}
    </View>
  );
}
