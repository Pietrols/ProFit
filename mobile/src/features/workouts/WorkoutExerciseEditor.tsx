import { useState } from 'react';
import { ExerciseTargetFields } from '../plans/ExerciseTargetFields';
import { targetForm } from '../plans/exerciseForm';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { randomId } from '@/lib/randomId';
import { exerciseForWorkout, parseSessionExercise } from './sessionExerciseForm';
import type { SessionItem } from './structureTypes';
import type { SnapshotExercise } from './types';
import { WorkoutExercisePicker } from './WorkoutExercisePicker';

export type ExerciseEditorMode = 'add' | 'replace' | 'targets';

export function WorkoutExerciseEditor({
  mode,
  item,
  busy,
  save,
  cancel,
}: {
  mode: ExerciseEditorMode;
  item: SessionItem | null;
  busy: boolean;
  save: (id: string, exercise: SnapshotExercise) => Promise<void>;
  cancel: () => void;
}) {
  const initial = mode === 'targets' ? (item?.exercise ?? null) : null;
  const [exercise, setExercise] = useState(initial);
  const [form, setForm] = useState(() => (initial ? targetForm(initial) : null));
  const [fields, setFields] = useState(initial?.logFields ?? []);
  const [id] = useState(() => (mode === 'targets' && item ? item.id : randomId()));
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (!form || !exercise || busy) return;
    setError(null);
    try {
      await save(id, parseSessionExercise(form, fields, exercise));
      cancel();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the exercise.');
    }
  }
  return (
    <Card>
      <AppText variant="title">
        {mode === 'targets'
          ? 'Edit workout targets'
          : mode === 'replace'
            ? `Replace ${item?.exercise.name ?? 'exercise'}`
            : 'Add an exercise'}
      </AppText>
      <AppText color="text2">
        For this workout. Saved sets keep their original exercise and targets.
      </AppText>
      {exercise && form ? (
        <>
          <AppText variant="label">{exercise.name}</AppText>
          <ExerciseTargetFields
            form={form}
            setForm={(value) =>
              setForm((previous) =>
                previous === null ? null : typeof value === 'function' ? value(previous) : value,
              )
            }
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
            label={mode === 'replace' ? 'Confirm replacement' : 'Save workout exercise'}
            disabled={busy}
            onPress={() => void submit()}
          />
          {mode !== 'targets' ? (
            <Button
              label="Choose another exercise"
              variant="secondary"
              disabled={busy}
              onPress={() => {
                setExercise(null);
                setForm(null);
                setError(null);
              }}
            />
          ) : null}
        </>
      ) : (
        <WorkoutExercisePicker
          busy={busy}
          choose={(chosen) => {
            const snapshot = exerciseForWorkout(chosen);
            setExercise(snapshot);
            setForm(targetForm(snapshot));
            setFields(snapshot.logFields);
            setError(null);
          }}
        />
      )}
      <Button label="Cancel exercise change" variant="secondary" disabled={busy} onPress={cancel} />
    </Card>
  );
}
