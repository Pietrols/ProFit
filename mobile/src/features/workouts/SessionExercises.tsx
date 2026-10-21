import { useEffect, useMemo, useState } from 'react';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { TextField } from '@/ui/TextField';
import { workoutItemProgress } from './itemProgress';
import type { AdjustmentContext, ItemChange } from './sessionChanges';
import type { SessionItem } from './structureTypes';

export function SessionExercises({
  detail,
  selected,
  busy,
  select,
  change,
  editingChanged,
}: {
  detail: AdjustmentContext;
  selected: string | null;
  busy: boolean;
  select: (itemId: string) => void;
  change: (item: SessionItem, change: ItemChange) => Promise<void>;
  editingChanged: (editing: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [intent, setIntent] = useState<{
    item: SessionItem;
    state: 'skipped' | 'removed';
    reason: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => editingChanged(false), [editingChanged]);
  const rows = useMemo(() => workoutItemProgress(detail), [detail]);
  const blocked = busy || !!intent;
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
  async function apply(item: SessionItem, patch: ItemChange) {
    setError(null);
    try {
      await change(item, patch);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this adjustment.');
      throw error;
    }
  }
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
          {rows.map(({ item, completed, remaining, canTrain, canReduce }) => (
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
          ))}
        </>
      ) : null}
    </>
  );
}
