import { useState } from 'react';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import type { SnapshotExercise, SetValues } from './types';
import { fieldLabel, parseSetDraft, setDraft, type Units } from './workoutForm';
export function SetForm({
  exercise,
  initial,
  units,
  busy,
  onLog,
  submitLabel = 'Log set',
}: {
  exercise: SnapshotExercise;
  initial: SetValues;
  units: Units;
  busy: boolean;
  onLog: (values: SetValues) => Promise<void>;
  submitLabel?: string;
}) {
  const [original] = useState(initial);
  const [draft, setDraftState] = useState(() => setDraft(initial, units));
  const [error, setError] = useState<string | null>(null);
  async function log() {
    setError(null);
    try {
      await onLog(parseSetDraft(draft, exercise.logFields, units, original));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this set.');
    }
  }
  return (
    <>
      {exercise.logFields.map((field) =>
        field === 'done' ? (
          <Button
            key={field}
            label={draft.done === 'true' ? 'Done: yes' : 'Mark done'}
            variant="secondary"
            disabled={busy}
            onPress={() =>
              setDraftState({ ...draft, done: draft.done === 'true' ? 'false' : 'true' })
            }
          />
        ) : (
          <TextField
            key={field}
            label={fieldLabel(field, units)}
            value={draft[field] ?? ''}
            editable={!busy}
            keyboardType={field === 'notes' ? 'default' : 'decimal-pad'}
            multiline={field === 'notes'}
            onChangeText={(value) => setDraftState({ ...draft, [field]: value })}
          />
        ),
      )}
      {error ? <AppText color="caution">{error}</AppText> : null}
      <Button
        label={busy ? 'Saving set' : submitLabel}
        disabled={busy}
        onPress={() => void log()}
      />
    </>
  );
}
