import { useState } from 'react';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { validateTimer, type TimerConfig, type TimerState } from './timers';
import { timerConfig } from './workoutForm';
import { TimerReadout } from './TimerReadout';
export function TimerControls({
  timer,
  busy,
  start,
  pause,
  resume,
  clear,
  showReadout = true,
}: {
  timer: TimerState | null;
  busy: boolean;
  start: (config: TimerConfig) => void;
  pause: () => void;
  resume: () => void;
  clear: () => void;
  showReadout?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<TimerConfig['mode']>('rest');
  const [seconds, setSeconds] = useState('60');
  const [rest, setRest] = useState('10');
  const [rounds, setRounds] = useState('8');
  const config = timerConfig(mode, seconds, rest, rounds);
  const error = validateTimer(config);
  return (
    <>
      {showReadout ? (
        <>
          <AppText variant="title">{timer?.config.mode ?? 'Timer'}</AppText>
          <TimerReadout timer={timer} busy={busy} pause={pause} resume={resume} />
        </>
      ) : null}
      <Button
        label={expanded ? 'Hide timer settings' : 'Timer settings'}
        variant="secondary"
        accessibilityState={{ expanded, disabled: busy }}
        disabled={busy}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? (
        <>
          {timer ? (
            <Button label="Clear timer" variant="secondary" disabled={busy} onPress={clear} />
          ) : null}
          {(['rest', 'interval', 'Tabata', 'EMOM', 'AMRAP', 'stopwatch'] as const).map((value) => (
            <Button
              key={value}
              label={`${mode === value ? 'Selected: ' : ''}${value}`}
              variant="secondary"
              disabled={busy}
              onPress={() => setMode(value)}
            />
          ))}
          {mode === 'rest' || mode === 'AMRAP' || mode === 'interval' ? (
            <TextField
              label={mode === 'interval' ? 'Work seconds' : 'Duration seconds'}
              value={seconds}
              onChangeText={setSeconds}
              keyboardType="number-pad"
              editable={!busy}
            />
          ) : null}
          {mode === 'interval' ? (
            <TextField
              label="Rest seconds"
              value={rest}
              onChangeText={setRest}
              keyboardType="number-pad"
              editable={!busy}
            />
          ) : null}
          {mode === 'interval' || mode === 'EMOM' ? (
            <TextField
              label="Rounds"
              value={rounds}
              onChangeText={setRounds}
              keyboardType="number-pad"
              editable={!busy}
            />
          ) : null}
          {error ? <AppText color="caution">{error}</AppText> : null}
          <Button
            label="Start timer"
            disabled={busy || !!error}
            onPress={() => {
              start(config);
              setExpanded(false);
            }}
          />
        </>
      ) : null}
    </>
  );
}
