import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { DayCard, WEEKDAYS } from '@/features/plans/DayCard';
import { nextPosition } from '@/features/plans/exerciseForm';
import { moveDay, orderedDays } from '@/features/plans/logic';
import { PlanState } from '@/features/plans/PlanState';
import type { PlanInput } from '@/features/plans/types';
import { usePlans } from '@/features/plans/usePlans';
import { SyncBanner } from '@/features/sync/SyncBanner';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ChipGroup } from '@/ui/ChipGroup';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';
export default function PlanEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>(); const plans = usePlans();
  const [input, setInput] = useState<PlanInput>({ name: '', shape: 'cycle', difficulty: 'standard', active: true });
  const [dayName, setDayName] = useState(''); const [weekday, setWeekday] = useState<number | null>(1);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false); const loaded = useRef<string | null>(null);
  const plan = plans.data?.plans.find((p) => p.id === id);
  useEffect(() => { if (plan && loaded.current !== plan.id) { setInput(plan); loaded.current = plan.id; } }, [plan]);
  if (plans.error || !plans.data) return <PlanState error={plans.error} retry={plans.retry} />;
  if (id && !plan) return <PlanState error={null} retry={plans.retry} missing />;
  const days = orderedDays(plans.data.days.filter((d) => d.planId === id));
  async function run(action: () => Promise<unknown>) { setBusy(true); setError(null); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the plan.'); } finally { setBusy(false); } }
  return <Screen title={id ? 'Edit plan' : 'New plan'}><SyncBanner />
    <TextField label="Plan name" value={input.name} onChangeText={(name) => setInput({ ...input, name })} maxLength={80} />
    <ChipGroup label="Shape" options={[{ label: 'Cycle', value: 'cycle' }, { label: 'Weekly', value: 'weekly' }]} value={input.shape} clearable={false} onChange={(shape) => shape && setInput({ ...input, shape })} />
    <ChipGroup label="Difficulty" options={[{ label: 'Gentle', value: 'gentle' }, { label: 'Standard', value: 'standard' }, { label: 'Hard', value: 'hard' }]} value={input.difficulty} clearable={false} onChange={(difficulty) => difficulty && setInput({ ...input, difficulty })} />
    <ChipGroup label="Show on Home" options={[{ label: 'Active', value: 'yes' }, { label: 'Inactive', value: 'no' }]} value={input.active ? 'yes' : 'no'} clearable={false} onChange={(v) => setInput({ ...input, active: v === 'yes' })} />
    <AppText color="text2">Save plan settings before editing days. Switching to weekly assigns days Monday onward; you can then change each weekday. Targets are stored at Standard; difficulty scales the suggested reps, time and distance.</AppText>
    {error ? <AppText color="caution" accessibilityLiveRegion="polite">{error}</AppText> : null}
    <Button label="Save plan" disabled={busy} onPress={() => void run(async () => { const saved = await plans.savePlan(input, id); if (!id) router.replace({ pathname: '/plans/form', params: { id: saved } }); })} />
    {plan ? <><Card><TextField label="New day name" value={dayName} onChangeText={setDayName} maxLength={80} />
      {plan.shape === 'weekly' ? <ChipGroup label="New day weekday" options={WEEKDAYS} value={weekday} clearable={false} onChange={setWeekday} /> : null}
      <Button label="Add day" disabled={busy} onPress={() => void run(async () => { await plans.saveDay({ planId: plan.id, position: nextPosition(days), weekday: plan.shape === 'weekly' ? weekday : null, name: dayName, restDay: false }); setDayName(''); })} /></Card>
      {!days.length ? <EmptyState icon="calendar-outline" title="No days yet" message="Add a named day, then choose exercises and targets." /> : null}
      {days.map((day, index) => <DayCard key={`${day.id}/${day.weekday}/${day.restDay}`} day={day} shape={plan.shape} save={plans.saveDay} remove={plans.removeDay} move={(direction) => plans.reorder(plan.id, moveDay(days, day.id, direction))} first={index === 0} last={index === days.length - 1} />)}
      <Button label={confirm ? 'Confirm delete plan and all days' : 'Delete plan'} variant="secondary" disabled={busy} onPress={() => confirm ? void run(async () => { await plans.removePlan(plan.id); router.replace('/plans'); }) : setConfirm(true)} />
      {confirm ? <Button label="Keep plan" variant="secondary" onPress={() => setConfirm(false)} /> : null}
    </> : <AppText color="text2">Save your plan to add days.</AppText>}
  </Screen>;
}
