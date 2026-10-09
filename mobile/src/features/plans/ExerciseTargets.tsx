import { useState } from 'react';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { MultiChipGroup } from '@/ui/MultiChipGroup';
import { TextField } from '@/ui/TextField';
import { formExercise, targetForm } from './exerciseForm';
import { LOG_FIELDS, type LogField, type PlanExercise, type PlanExerciseInput } from './types';
export function ExerciseTargets({ exercise, name, save, remove }: { exercise: PlanExercise; name: string; save: (input: PlanExerciseInput, id: string) => Promise<string>; remove: (id: string) => Promise<void> }) {
  const [form, setForm] = useState(() => targetForm(exercise)); const [fields, setFields] = useState<LogField[]>(exercise.logFields);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) { setBusy(true); setError(null); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save targets.'); } finally { setBusy(false); } }
  return <Card><AppText variant="title">{name}</AppText>
    <TextField label="Sets" value={form.sets} keyboardType="number-pad" onChangeText={(sets) => setForm({ ...form, sets })} />
    <TextField label="Target reps (optional)" value={form.reps} keyboardType="number-pad" onChangeText={(reps) => setForm({ ...form, reps })} />
    <TextField label="Target time in seconds (optional)" value={form.time} keyboardType="number-pad" onChangeText={(time) => setForm({ ...form, time })} />
    <TextField label="Target distance in metres (optional)" value={form.distance} keyboardType="decimal-pad" onChangeText={(distance) => setForm({ ...form, distance })} />
    <TextField label="Rest seconds" value={form.rest} keyboardType="number-pad" onChangeText={(rest) => setForm({ ...form, rest })} />
    <MultiChipGroup label="Log each set" options={LOG_FIELDS.map((value) => ({ value, label: value === 'RPE' ? 'Effort (RPE)' : value[0]!.toUpperCase() + value.slice(1) }))} values={fields} onToggle={(field) => setFields((prev) => prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field])} hint="Choose the fields you want to fill in during a session." />
    {error ? <AppText color="caution" accessibilityLiveRegion="polite">{error}</AppText> : null}
    <Button label="Save targets" disabled={busy} onPress={() => void run(() => save(formExercise(form, { ...exercise, logFields: fields }), exercise.id))} />
    <Button label="Remove exercise" variant="secondary" disabled={busy} onPress={() => void run(() => remove(exercise.id))} />
  </Card>;
}
