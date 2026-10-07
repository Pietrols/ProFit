import { useState } from 'react';
import { View } from 'react-native';
import type { UnitSystem } from '@/features/profile/types';
import { addDays, formatDay } from '@/lib/dates';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ChipGroup } from '@/ui/ChipGroup';
import { TextField } from '@/ui/TextField';
import { parseWeight, unitLabel, weightInputValue } from './units';
import type { WeightEntry } from './weightLog';

type Props = {
  today: string;
  initialDay: string;
  entries: WeightEntry[];
  unitSystem: UnitSystem;
  onSave: (day: string, weightKg: number, note: string | null) => Promise<void>;
  onDelete: (day: string) => Promise<void>;
  onClose: () => void;
};

// Log or change the weigh-in for one of the last seven days. Picking a day that already has an
// entry loads it, so the same form edits and deletes.
export function WeightForm({ today, initialDay, entries, unitSystem, onSave, onDelete, onClose }: Props) {
  const { space } = useAppTheme();
  const entryFor = (day: string) => entries.find((e) => e.date === day) ?? null;
  const [day, setDay] = useState(initialDay);
  const [value, setValue] = useState(() => {
    const existing = entryFor(initialDay);
    return existing ? weightInputValue(existing.weightKg, unitSystem) : '';
  });
  const [note, setNote] = useState(() => entryFor(initialDay)?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const existing = entryFor(day);

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  if (!days.includes(initialDay)) days.push(initialDay);

  function pickDay(next: string | null) {
    if (!next) return;
    setDay(next);
    const found = entryFor(next);
    setValue(found ? weightInputValue(found.weightKg, unitSystem) : '');
    setNote(found?.note ?? '');
    setError(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const parsed = parseWeight(value, unitSystem);
    if ('error' in parsed) return setError(parsed.error);
    void run(() => onSave(day, parsed.kg, note.trim() || null));
  }

  return (
    <Card>
      <AppText variant="title">{existing ? 'Change weigh-in' : 'Log weight'}</AppText>
      <ChipGroup label="Day" clearable={false} options={days.map((d) => ({ value: d, label: formatDay(d, today) }))} value={day} onChange={pickDay} />
      <TextField
        label={`Weight (${unitLabel(unitSystem)})`}
        value={value}
        onChangeText={(text) => {
          setValue(text);
          setError(null);
        }}
        keyboardType="decimal-pad"
        maxLength={6}
        placeholder={unitSystem === 'imperial' ? '180.0' : '80.0'}
        error={error}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
      />
      <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={200} placeholder="For example: after breakfast" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xs }}>
        <Button label={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} />
        <Button label="Cancel" variant="secondary" onPress={onClose} disabled={busy} />
        {existing ? <Button label="Delete" variant="secondary" onPress={() => run(() => onDelete(day))} disabled={busy} /> : null}
      </View>
    </Card>
  );
}
