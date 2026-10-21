import { useEffect, useMemo, useState } from 'react';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { TextField } from '@/ui/TextField';
import { workoutItemProgress } from './itemProgress';
import type { AdjustmentContext, ItemChange } from './sessionChanges';
import type { MoveDirection } from './sessionOrder';
import { WorkoutExerciseEditor, type ExerciseEditorMode } from './WorkoutExerciseEditor';
import type { SnapshotExercise } from './types';
import type { SessionItem } from './structureTypes';

export function SessionExercises({
  detail,
  selected,
  busy,
  select,
  change,
  editingChanged,
  move,
  edit,
}: {
  detail: AdjustmentContext;
  selected: string | null;
  busy: boolean;
  select: (itemId: string) => void;
  change: (item: SessionItem, change: ItemChange) => Promise<void>;
  editingChanged: (editing: boolean) => void;
  move: (item: SessionItem, direction: MoveDirection) => Promise<void>;
  edit: (
    mode: ExerciseEditorMode,
    item: SessionItem | null,
    id: string,
    exercise: SnapshotExercise,
  ) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editor, setEditor] = useState<{
    mode: ExerciseEditorMode;
    item: SessionItem | null;
  } | null>(null);
  const [intent, setIntent] = useState<{
    item: SessionItem;
    state: 'skipped' | 'removed';
    reason: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => editingChanged(false), [editingChanged]);
  const rows = useMemo(() => workoutItemProgress(detail), [detail]);
  const blocked = busy || !!intent || !!editor;
  function openEditor(mode: ExerciseEditorMode, item: SessionItem | null) {
    setEditor({ mode, item });
    setError(null);
    editingChanged(true);
  }
  function closeEditor() {
    setEditor(null);
    editingChanged(false);
  }
  function close() {
    setIntent(null);
    setError(null);
    editingChanged(false);
  }
  function omit(item: SessionItem, state: 'skipped' | 'removed') {
    setIntent({ item, state, reason: item.reason ?? '' });
    setError(null);
    editingChanged(true);
  }
  async function perform(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this adjustment.');
      throw error;
    }
  }
  const apply = (item: SessionItem, patch: ItemChange) => perform(() => change(item, patch));
  async function saveOmission() {
    if (!intent) return;
    try {
      await apply(intent.item, {
        kind: 'state',
        state: intent.state,
        reason: intent.reason.trim() || null,
      });
      close();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this adjustment.');
    }
  }
  return (
    <>
      <Button
        label={expanded ? 'Hide exercise overview' : 'Choose or adjust exercises'}
        variant="secondary"
        disabled={blocked}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? (
        <>
          <AppText variant="title">For this workout</AppText>
          <Button
            label="Add exercise to workout"
            variant="secondary"
            disabled={blocked}
            onPress={() => openEditor('add', null)}
          />
          {editor ? (
            <WorkoutExerciseEditor
              key={`${editor.mode}/${editor.item?.id ?? 'new'}`}
              mode={editor.mode}
              item={editor.item}
              busy={busy}
              cancel={closeEditor}
              save={(id, exercise) => edit(editor.mode, editor.item, id, exercise)}
            />
          ) : null}
          {error ? (
            <AppText color="caution" accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
          {intent ? (
            <Card>
              <AppText variant="title">
                {intent.state === 'skipped' ? 'Skip' : 'Remove'} remaining work for{' '}
                {intent.item.exercise.name}?
              </AppText>
              <AppText color="text2">
                Saved results stay in Logged sets. Cancel and review the exercise if it changes on
                another phone.
              </AppText>
              <TextField
                label="Reason (optional)"
                value={intent.reason}
                editable={!busy}
                maxLength={500}
                onChangeText={(reason) => setIntent({ ...intent, reason })}
              />
              <Button
                label="Confirm adjustment"
                disabled={busy}
                onPress={() => void saveOmission()}
              />
              <Button
                label="Cancel adjustment"
                variant="secondary"
                disabled={busy}
                onPress={close}
              />
            </Card>
          ) : null}
          {rows.map(
            ({
              item,
              completed,
              remaining,
              canTrain,
              canReduce,
              canMoveUp,
              canMoveDown,
              canDefer,
            }) => (
              <Card key={item.id}>
                <AppText variant="label">
                  {item.exercise.name}
                  {selected === item.id ? ' (selected)' : ''}
                </AppText>
                <AppText>
                  {completed} of {item.exercise.sets} target sets logged
                </AppText>
                <AppText color="text2">
                  {item.deletedAt ? 'Removed' : item.state}
                  {item.origin === 'planned' ? '' : `, ${item.origin}`}
                </AppText>
                {item.reason ? <AppText color="text2">{item.reason}</AppText> : null}
                {item.deletedAt ? null : item.state === 'active' ? (
                  <>
                    <Button
                      label={`Train ${item.exercise.name} now`}
                      variant="secondary"
                      disabled={blocked || !canTrain}
                      onPress={() => select(item.id)}
                    />
                    <Button
                      label={`Edit workout targets for ${item.exercise.name}`}
                      variant="secondary"
                      disabled={blocked}
                      onPress={() => openEditor('targets', item)}
                    />
                    <Button
                      label={`Replace remaining ${item.exercise.name} work`}
                      variant="secondary"
                      disabled={blocked || !canTrain}
                      onPress={() => openEditor('replace', item)}
                    />
                    <Button
                      label={`Do ${item.exercise.name} later`}
                      variant="secondary"
                      disabled={blocked || !canDefer}
                      onPress={() => void perform(() => move(item, 'later')).catch(() => {})}
                    />
                    <Button
                      label={`Move ${item.exercise.name} up`}
                      variant="secondary"
                      disabled={blocked || !canMoveUp}
                      onPress={() => void perform(() => move(item, 'up')).catch(() => {})}
                    />
                    <Button
                      label={`Move ${item.exercise.name} down`}
                      variant="secondary"
                      disabled={blocked || !canMoveDown}
                      onPress={() => void perform(() => move(item, 'down')).catch(() => {})}
                    />
                    <Button
                      label={`Skip remaining ${item.exercise.name} sets`}
                      variant="secondary"
                      disabled={blocked || remaining === 0}
                      onPress={() => omit(item, 'skipped')}
                    />
                    <Button
                      label={`Add a set to ${item.exercise.name}`}
                      variant="secondary"
                      disabled={blocked || item.exercise.sets >= 100}
                      onPress={() =>
                        void apply(item, {
                          kind: 'targets',
                          targets: { ...item.exercise, sets: item.exercise.sets + 1 },
                        }).catch(() => {})
                      }
                    />
                    <Button
                      label={`Remove last unlogged set from ${item.exercise.name}`}
                      variant="secondary"
                      disabled={blocked || !canReduce}
                      onPress={() =>
                        void apply(item, {
                          kind: 'targets',
                          targets: { ...item.exercise, sets: item.exercise.sets - 1 },
                        }).catch(() => {})
                      }
                    />
                    <Button
                      label={`Remove ${item.exercise.name} from workout`}
                      variant="secondary"
                      disabled={blocked}
                      onPress={() => omit(item, 'removed')}
                    />
                  </>
                ) : (
                  <Button
                    label={`Restore ${item.exercise.name}`}
                    variant="secondary"
                    disabled={blocked}
                    onPress={() =>
                      void apply(item, { kind: 'state', state: 'active', reason: null }).catch(
                        () => {},
                      )
                    }
                  />
                )}
              </Card>
            ),
          )}
        </>
      ) : null}
    </>
  );
}
