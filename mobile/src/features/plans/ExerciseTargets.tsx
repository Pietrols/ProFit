import { useState } from 'react';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { formExercise, targetForm } from './exerciseForm';
import { ExerciseTargetFields } from './ExerciseTargetFields';
import type { LogField, PlanExercise, PlanExerciseInput } from './types';
export function ExerciseTargets({
  exercise,
  name,
  save,
  remove,
}: {
  exercise: PlanExercise;
  name: string;
  save: (input: PlanExerciseInput, id: string) => Promise<string>;
  remove: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState(() => targetForm(exercise));
  const [fields, setFields] = useState<LogField[]>(exercise.logFields);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save targets.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <AppText variant="title">{name}</AppText>
      <ExerciseTargetFields
        form={form}
        setForm={setForm}
        fields={fields}
        setFields={setFields}
        busy={busy}
      />
      {error ? (
        <AppText color="caution" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      <Button
        label="Save targets"
        disabled={busy}
        onPress={() =>
          void run(() => save(formExercise(form, { ...exercise, logFields: fields }), exercise.id))
        }
      />
      <Button
        label="Remove exercise"
        variant="secondary"
        disabled={busy}
        onPress={() => void run(() => remove(exercise.id))}
      />
    </Card>
  );
}
