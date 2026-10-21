import { useRef, useState } from 'react';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import type { SnapshotExercise, SetValues } from './types';
import type { LogField } from '../plans/types';
import { SetNumberField } from './SetNumberField';
import { stepDraft, stepperSpec } from './stepDraft';
import { fieldLabel, parseSetDraft, setDraft, type SetDraftEntry, type Units } from './workoutForm';
export function SetForm({
  exercise,
  initial,
  units,
  busy,
  onLog,
  submitLabel = 'Log set',
  savedDraft,
  onDraftChange,
}: {
  exercise: SnapshotExercise;
  initial: SetValues;
  units: Units;
  busy: boolean;
  onLog: (values: SetValues) => Promise<void>;
  submitLabel?: string;
  savedDraft?: SetDraftEntry;
  onDraftChange?: (entry: SetDraftEntry) => void;
}) {
  const [original] = useState(savedDraft?.original ?? initial);
  const [draft, setDraftState] = useState(() => savedDraft?.draft ?? setDraft(original, units));
  const draftRef = useRef(draft);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  function change(next: typeof draft) {
    if (busy || submitting.current) return;
    draftRef.current = next;
    setDraftState(next);
    onDraftChange?.({ original, draft: next });
  }
  function changeField(field: LogField, value: string) {
    change({ ...draftRef.current, [field]: value });
  }
  async function log() {
    if (busy || submitting.current) return;
    submitting.current = true;
    setError(null);
    try {
      await onLog(parseSetDraft(draftRef.current, exercise.logFields, units, original));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this set.');
    } finally {
      submitting.current = false;
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
            onPress={() => changeField('done', draftRef.current.done === 'true' ? 'false' : 'true')}
          />
        ) : field === 'reps' || field === 'weight' ? (
          <SetNumberField
            key={`${field}/${units}`}
            field={field}
            units={units}
            value={draft[field] ?? ''}
            busy={busy}
            change={(text) => changeField(field, text)}
            adjust={(direction, increment) =>
              changeField(
                field,
                stepDraft(
                  draftRef.current[field] ?? '',
                  direction,
                  increment,
                  stepperSpec(field, units),
                ),
              )
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
            onChangeText={(value) => changeField(field, value)}
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
