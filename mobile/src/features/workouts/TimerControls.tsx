import { useState } from 'react';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { formatTimer, timerView, validateTimer, type TimerConfig, type TimerState } from './timers';
import { timerConfig } from './workoutForm';
export function TimerControls({ timer, now, busy, start, pause, resume, clear }: { timer: TimerState | null; now: number; busy: boolean; start: (config: TimerConfig) => void; pause: () => void; resume: () => void; clear: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<TimerConfig['mode']>('rest'); const [seconds, setSeconds] = useState('60'); const [rest, setRest] = useState('10'); const [rounds, setRounds] = useState('8');
  const config = timerConfig(mode, seconds, rest, rounds); const error = validateTimer(config); const view = timer ? timerView(timer, now) : null;
  return <>
    <AppText variant="title">{timer?.config.mode ?? 'Timer'}</AppText>
    <AppText variant="display">{view ? formatTimer(view.remainingMs ?? view.elapsedMs, view.remainingMs !== null) : '0:00'}</AppText>
    {view ? <AppText>{view.segment}{view.round !== null ? ` · Round ${view.round}` : ''}</AppText> : null}
    {timer && !view?.done ? <Button label={timer.runningSince === null ? 'Resume timer' : 'Pause timer'} variant="secondary" disabled={busy || timer.config.mode === 'session'} onPress={timer.runningSince === null ? resume : pause} /> : null}
    {timer ? <Button label="Clear timer" variant="secondary" disabled={busy} onPress={clear} /> : null}
    <Button label={expanded ? 'Hide timer settings' : 'Timer settings'} variant="secondary" onPress={() => setExpanded(!expanded)} />
    {expanded ? <>
    {(['rest', 'interval', 'Tabata', 'EMOM', 'AMRAP', 'stopwatch'] as const).map((value) => <Button key={value} label={`${mode === value ? 'Selected: ' : ''}${value}`} variant="secondary" disabled={busy} onPress={() => setMode(value)} />)}
    {mode === 'rest' || mode === 'AMRAP' || mode === 'interval' ? <TextField label={mode === 'interval' ? 'Work seconds' : 'Duration seconds'} value={seconds} onChangeText={setSeconds} keyboardType="number-pad" /> : null}
    {mode === 'interval' ? <TextField label="Rest seconds" value={rest} onChangeText={setRest} keyboardType="number-pad" /> : null}
    {mode === 'interval' || mode === 'EMOM' ? <TextField label="Rounds" value={rounds} onChangeText={setRounds} keyboardType="number-pad" /> : null}
    {error ? <AppText color="caution">{error}</AppText> : null}
    <Button label="Start timer" disabled={busy || !!error} onPress={() => { start(config); setExpanded(false); }} />
    </> : null}
  </>;
}
