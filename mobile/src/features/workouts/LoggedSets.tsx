import { useState } from 'react';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { LoggedSetValues } from './LoggedSetValues';
import { SetConflict, type SetConflictState } from './SetConflict';
import { SetForm } from './SetForm';
import { SetConflictError, type SetRecord, type SetUndoReceipt } from './setChanges';
import type { SetLog, SetValues, WorkoutSession } from './types';
import type { useWorkout } from './useWorkout';
import { setLabel, type Units } from './workoutForm';

export function LoggedSets({
  session,
  logs,
  units,
  busy,
  actions,
  execute,
  editingChanged,
  changed,
  deleted,
}: {
  session: WorkoutSession;
  logs: readonly SetLog[];
  units: Units;
  busy: boolean;
  actions: Pick<ReturnType<typeof useWorkout>, 'correct' | 'remove' | 'undo'>;
  execute: (action: () => Promise<void>) => Promise<void>;
  editingChanged: (editing: boolean) => void;
  changed: () => void;
  deleted: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<{ record: SetRecord; units: Units } | null>(null);
  const [undo, setUndo] = useState<{ receipt: SetUndoReceipt; units: Units } | null>(null);
  const [conflict, setConflict] = useState<SetConflictState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const allowed = session.status !== 'abandoned';
  function close() {
    setEditing(null);
    setConflict(null);
    editingChanged(false);
  }
  function showConflict(error: unknown, values: SetValues | null, displayUnits: Units) {
    if (error instanceof SetConflictError) {
      setConflict({ current: error.current, values, units: displayUnits });
      editingChanged(true);
    }
  }
  async function change(
    target: SetRecord,
    values: SetValues | null,
    displayUnits: Units,
    restore = false,
  ) {
    try {
      await execute(async () => {
        if (values === null) {
          const receipt = await actions.remove(target);
          setUndo({ receipt, units: displayUnits });
          setMessage('Set deleted. You can undo this change.');
          close();
          changed();
          await deleted(target.id);
        } else {
          await actions.correct(target, values, restore);
          if (undo?.receipt.before.id === target.id) setUndo(null);
          setMessage('Set corrected. Totals and records use the saved values.');
          close();
          changed();
        }
      });
    } catch (error) {
      showConflict(error, values, displayUnits);
      throw error;
    }
  }
  async function restoreDeleted() {
    if (!undo) return;
    try {
      await execute(async () => {
        await actions.undo(undo.receipt);
        setUndo(null);
        setMessage('Set restored with its original logging time.');
        close();
        changed();
      });
    } catch (error) {
      showConflict(error, undo.receipt.before.values, undo.units);
    }
  }
  const blocked = busy || !!editing || !!conflict;
  const exercise = editing ? session.snapshot.exercises[editing.record.exercisePosition]! : null;
  return (
    <>
      <AppText variant="title">Logged sets</AppText>
      {message ? <AppText accessibilityLiveRegion="polite">{message}</AppText> : null}
      {undo ? (
        <Button
          label="Undo set deletion"
          variant="secondary"
          disabled={blocked}
          onPress={() => void restoreDeleted()}
        />
      ) : null}
      {conflict ? (
        <SetConflict
          conflict={conflict}
          busy={busy}
          keep={close}
          apply={() =>
            void change(
              conflict.current,
              conflict.values,
              conflict.units,
              !!conflict.current.deletedAt,
            ).catch(() => {})
          }
        />
      ) : null}
      {editing && exercise ? (
        <Card>
          <AppText variant="title">Correct {exercise.name}</AppText>
          <AppText>{setLabel(editing.record.setIndex, exercise.sets)}</AppText>
          <AppText color="text2">
            The original logging time is kept. Saving does not restart rest.
          </AppText>
          <SetForm
            key={editing.record.id}
            exercise={exercise}
            initial={editing.record.values}
            units={editing.units}
            busy={busy || !!conflict}
            submitLabel="Save correction"
            onLog={(values) => change(editing.record, values, editing.units)}
          />
          <Button label="Cancel correction" variant="secondary" disabled={busy} onPress={close} />
        </Card>
      ) : null}
      {!logs.length ? <AppText color="text2">No sets logged yet.</AppText> : null}
      {logs.map((log) => {
        const item = session.snapshot.exercises[log.exercisePosition]!;
        const target: SetRecord = { ...log, deletedAt: null };
        return (
          <Card key={log.id}>
            <AppText variant="label">
              {item.name}, {setLabel(log.setIndex, item.sets)}
            </AppText>
            <LoggedSetValues log={log} units={units} />
            {allowed ? (
              <>
                <Button
                  label={`Edit ${item.name} set ${log.setIndex + 1}`}
                  variant="secondary"
                  disabled={blocked}
                  onPress={() => {
                    setEditing({ record: target, units });
                    setMessage(null);
                    editingChanged(true);
                    changed();
                  }}
                />
                <Button
                  label={`Delete ${item.name} set ${log.setIndex + 1}`}
                  variant="secondary"
                  disabled={blocked}
                  onPress={() => void change(target, null, units).catch(() => {})}
                />
              </>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}
