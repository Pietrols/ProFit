import type { Dispatch, SetStateAction } from 'react';
import { MultiChipGroup } from '@/ui/MultiChipGroup';
import { TextField } from '@/ui/TextField';
import type { TargetForm } from './exerciseForm';
import { LOG_FIELDS, type LogField } from './types';

export function ExerciseTargetFields({
  form,
  setForm,
  fields,
  setFields,
  busy = false,
}: {
  form: TargetForm;
  setForm: Dispatch<SetStateAction<TargetForm>>;
  fields: LogField[];
  setFields: Dispatch<SetStateAction<LogField[]>>;
  busy?: boolean;
}) {
  return (
    <>
      <TextField
        editable={!busy}
        label="Sets"
        value={form.sets}
        keyboardType="number-pad"
        onChangeText={(sets) => setForm({ ...form, sets })}
      />
      <TextField
        editable={!busy}
        label="Target reps (optional)"
        value={form.reps}
        keyboardType="number-pad"
        onChangeText={(reps) => setForm({ ...form, reps })}
      />
      <TextField
        editable={!busy}
        label="Target time in seconds (optional)"
        value={form.time}
        keyboardType="number-pad"
        onChangeText={(time) => setForm({ ...form, time })}
      />
      <TextField
        editable={!busy}
        label="Target distance in metres (optional)"
        value={form.distance}
        keyboardType="decimal-pad"
        onChangeText={(distance) => setForm({ ...form, distance })}
      />
      <TextField
        editable={!busy}
        label="Rest seconds"
        value={form.rest}
        keyboardType="number-pad"
        onChangeText={(rest) => setForm({ ...form, rest })}
      />
      <MultiChipGroup
        disabled={busy}
        label="Log each set"
        options={LOG_FIELDS.map((value) => ({
          value,
          label: value === 'RPE' ? 'Effort (RPE)' : value[0]!.toUpperCase() + value.slice(1),
        }))}
        values={fields}
        onToggle={(field) =>
          setFields((prev) =>
            prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field],
          )
        }
        hint="Choose the fields you want to fill in during a session."
      />
    </>
  );
}
