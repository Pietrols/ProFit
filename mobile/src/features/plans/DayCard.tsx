import { router } from 'expo-router';
import { useState } from 'react';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ChipGroup } from '@/ui/ChipGroup';
import { TextField } from '@/ui/TextField';
import type { DayInput, PlanDay, Shape } from './types';
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, index) => ({ label, value: index + 1 }));
export function DayCard({ day, shape, save, remove, move, first, last }: { day: PlanDay; shape: Shape; save: (input: DayInput, id: string) => Promise<string>; remove: (id: string) => Promise<void>; move: (direction: -1 | 1) => Promise<void>; first: boolean; last: boolean }) {
  const [name, setName] = useState(day.name); const [weekday, setWeekday] = useState(day.weekday); const [rest, setRest] = useState(day.restDay);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  async function run(action: () => Promise<unknown>) { setBusy(true); setError(null); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this day.'); } finally { setBusy(false); } }
  return <Card><TextField label="Day name" value={name} onChangeText={setName} maxLength={80} />
    {shape === 'weekly' ? <ChipGroup label="Weekday" options={WEEKDAYS} value={weekday} onChange={setWeekday} clearable={false} /> : null}
    <ChipGroup label="Day type" options={[{ label: 'Training', value: 'train' }, { label: 'Rest', value: 'rest' }]} value={rest ? 'rest' : 'train'} onChange={(v) => setRest(v === 'rest')} clearable={false} />
    {error ? <AppText color="caution" accessibilityLiveRegion="polite">{error}</AppText> : null}
    <Button label="Save day" disabled={busy} onPress={() => void run(() => save({ ...day, name, weekday, restDay: rest }, day.id))} />
    <Button label="Exercises and targets" variant="secondary" onPress={() => router.push({ pathname: '/plans/day', params: { id: day.id } })} />
    <Button label="Move up" variant="secondary" disabled={busy || first} onPress={() => void run(() => move(-1))} /><Button label="Move down" variant="secondary" disabled={busy || last} onPress={() => void run(() => move(1))} />
    <Button label={confirm ? 'Confirm delete day and its exercises' : 'Delete day'} variant="secondary" disabled={busy} onPress={() => confirm ? void run(() => remove(day.id)) : setConfirm(true)} />
    {confirm ? <Button label="Keep day" variant="secondary" onPress={() => setConfirm(false)} /> : null}
  </Card>;
}
