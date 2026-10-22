import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';
import { useMe } from '@/features/auth/AuthProvider';
import { SyncBanner } from '@/features/sync/SyncBanner';
import { workoutPrefill } from '@/features/workouts/workoutPrefill';
import { structuredWorkoutResults } from '@/features/workouts/structuredResults';
import { chooseWorkoutSlot } from '@/features/workouts/workoutSelection';
import { SessionExercises } from '@/features/workouts/SessionExercises';
import { DraftSetForm } from '@/features/workouts/DraftSetForm';
import { draftResultRevision } from '@/features/workouts/draftRecord';
import { TimerControls } from '@/features/workouts/TimerControls';
import { TimerReadout } from '@/features/workouts/TimerReadout';
import { workoutPreview } from '@/features/workouts/workoutPreview';
import { SessionClock } from '@/features/workouts/SessionClock';
import { LoggedSets } from '@/features/workouts/LoggedSets';
import {
  loadWorkoutTimer,
  saveWorkoutTimer,
  timerAfterLogs,
} from '@/features/workouts/timerStorage';
import { pauseTimer, resumeTimer, startTimer, type TimerState } from '@/features/workouts/timers';
import { useWorkout } from '@/features/workouts/useWorkout';
import type { StructuredWorkoutDetail } from '@/features/workouts/structuredDetail';
import { useWorkoutAwake } from '@/features/workouts/useWorkoutAwake';
import { useWorkoutAlerts } from '@/features/workouts/WorkoutAlerts';
import type { SetValues } from '@/features/workouts/types';
import { recordLabel, setLabel, volumeLabel } from '@/features/workouts/workoutForm';
import { randomId } from '@/lib/randomId';
import { kvStore } from '@/lib/storage/local';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';
export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workouts = useWorkout(id);
  if (!workouts.loaded || (!workouts.data && workouts.error))
    return (
      <Screen title="Workout">
        <EmptyState
          icon="barbell-outline"
          title={workouts.error ? 'Could not load workout' : 'Loading workout'}
          message={workouts.error ?? 'Reading your saved session.'}
          actionLabel={workouts.error ? 'Retry' : undefined}
          onAction={workouts.retry}
        />
      </Screen>
    );
  const current = workouts.data;
  if (!current || !workouts.userId)
    return (
      <Screen title="Workout">
        <EmptyState
          icon="barbell-outline"
          title="Session unavailable"
          message="This session may have been deleted."
          actionLabel="Retry"
          onAction={workouts.retry}
        />
      </Screen>
    );
  return (
    <Workout
      key={`${workouts.userId}/${id}`}
      current={current}
      workouts={workouts}
      user={workouts.userId}
    />
  );
}
function Workout({
  current,
  workouts,
  user,
}: {
  current: StructuredWorkoutDetail;
  workouts: ReturnType<typeof useWorkout>;
  user: string;
}) {
  const { session, itemView, resultView } = current;
  const logs = useMemo(() => resultView.loggedResults.map((row) => row.log), [resultView]);
  const { me } = useMe();
  const units = me?.profile.unitSystem ?? 'metric';
  const { alerts, error: alertError, report, enable } = useWorkoutAlerts();
  const [notes, setNotes] = useState(session.notes);
  const timerVersion = useRef(0);
  const [savedTimer, setTimer] = useState<TimerState | null>(null);
  const timer = useMemo(
    () =>
      timerAfterLogs(
        savedTimer,
        logs.map((log) => log.loggedAt),
        resultView.results.map((row) => row.log.id),
      ),
    [savedTimer, resultView, logs],
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const [confirm, setConfirm] = useState<'completed' | 'abandoned' | null>(null);
  const [lastSet, setLastSet] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const version = ++timerVersion.current;
    loadWorkoutTimer(kvStore, user, session.id).then(
      (value) => {
        if (live && version === timerVersion.current) {
          setTimer(value);
          setReady(true);
        }
      },
      (e: unknown) => {
        if (live && version === timerVersion.current)
          setError(e instanceof Error ? e.message : 'Could not read timer.');
      },
    );
    return () => {
      live = false;
    };
  }, [user, session.id]);
  const summary = useMemo(() => structuredWorkoutResults(current), [current]);
  const active = session.status === 'active';
  const selection = useMemo(
    () => chooseWorkoutSlot(current, selectedItemId),
    [current, selectedItemId],
  );
  const next = selection.current;
  const preview = useMemo(() => workoutPreview(current, next), [current, next]);
  const draftRevision = next ? draftResultRevision(current.resultRecords, next.id) : 'new';
  const draftKey = next ? `${next.id}/${draftRevision}` : '';
  const changesBlocked =
    busy || correcting || adjusting || workouts.stale || !!workouts.error || !summary.available;
  const savedNext = next ? logs.find((log) => log.id === next.id) : null;
  const awakeError = useWorkoutAwake(active);
  useEffect(() => {
    if (ready || !active) void alerts.update(user, session.id, active ? timer : null).catch(report);
  }, [alerts, user, session.id, active, ready, timer, report]);
  const nextItem = next ? itemView.items.find((item) => item.id === next.itemId) : null;
  const exercise = nextItem?.exercise;
  const initial = useMemo(
    () => (exercise ? workoutPrefill(current, exercise) : {}),
    [current, exercise],
  );
  async function saveTimer(value: TimerState | null) {
    ++timerVersion.current;
    await alerts.update(user, session.id, null).catch(report);
    await saveWorkoutTimer(kvStore, user, session.id, value);
    setTimer(value);
    setReady(true);
    await alerts.update(user, session.id, value).catch(report);
  }
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const fire = (action: () => Promise<void>) => {
    void run(action).catch(() => {});
  };
  async function log(values: SetValues) {
    if (!next || !nextItem || !exercise || savedNext || changesBlocked || lock.current)
      throw new Error('Refresh this set before logging it. Your draft is kept.');
    await run(async () => {
      const id = await workouts.log({
        item: nextItem,
        setIndex: next.setIndex,
        values,
        difficulty: session.snapshot.difficulty,
        easierToday: session.easierToday,
      });
      setLastSet(values.done === false ? null : id);
      try {
        await saveTimer(
          values.done !== false && exercise.restSeconds
            ? {
                ...startTimer(
                  { mode: 'rest', seconds: exercise.restSeconds },
                  Date.now(),
                  randomId(),
                ),
                sourceSetId: id,
              }
            : null,
        );
      } catch {
        setError('Set saved. Rest timer could not be saved; reset the timer before continuing.');
        setReady(false);
      }
    });
  }
  async function finish(status: 'completed' | 'abandoned') {
    await workouts.notes(session.id, notes, session.easierToday);
    await workouts.finish(session.id, status);
    try {
      await saveTimer(null);
    } catch {
      setError('Session saved. The old timer could not be cleared.');
    }
    setConfirm(null);
  }
  return (
    <Screen title={session.snapshot.dayName} scrollRef={scroll}>
      <SyncBanner />
      {workouts.error ? (
        <>
          <AppText color="caution">{workouts.error}</AppText>
          <Button label="Retry workout read" variant="secondary" onPress={workouts.retry} />
        </>
      ) : null}
      {!summary.available ? (
        <Card>
          <AppText color="caution">
            Some saved workout data is unavailable. Totals may be incomplete. Refresh before logging
            another set or finishing.
          </AppText>
          <Button label="Refresh workout data" variant="secondary" onPress={workouts.retry} />
        </Card>
      ) : null}
      {error ? <AppText color="caution">{error}</AppText> : null}
      {workouts.stale && !workouts.error ? (
        <AppText color="text2" accessibilityLiveRegion="polite">
          Refreshing saved workout.
        </AppText>
      ) : null}
      {awakeError && active ? <AppText color="caution">{awakeError}</AppText> : null}
      {active && !ready ? (
        error ? (
          <Button
            label="Reset saved timer"
            disabled={busy}
            onPress={() => fire(() => saveTimer(null))}
          />
        ) : (
          <AppText color="text2">Loading saved timer</AppText>
        )
      ) : null}
      {active && exercise && next ? (
        <Card>
          <AppText variant="title">{exercise.name}</AppText>
          <AppText color="text2">
            {setLabel(next.setIndex, exercise.sets)} · {summary.completed} / {summary.total} target
            sets logged
          </AppText>
          {timer ? (
            <TimerReadout
              compact
              timer={timer}
              busy={busy || !ready}
              pause={() => fire(() => saveTimer(pauseTimer(timer, Date.now())))}
              resume={() => fire(() => saveTimer(resumeTimer(timer, Date.now())))}
            />
          ) : null}
          {savedNext ? (
            <AppText color="caution">
              This set has an incomplete saved result. Use Edit in Logged sets below to review it,
              or delete the saved result before logging a new performance.
            </AppText>
          ) : (
            <DraftSetForm
              key={draftKey}
              scope={{ user, session: session.id, item: next.itemId, slot: next.id }}
              baseRevision={draftRevision}
              exercise={exercise}
              initial={initial}
              units={units}
              busy={changesBlocked || !ready}
              onLog={log}
              cleanupFailed={() =>
                setError(
                  'Set saved. Old draft cleanup failed. Saved results take precedence when reopening.',
                )
              }
            />
          )}
        </Card>
      ) : active && summary.available ? (
        <Card>
          <AppText variant="title">
            {session.snapshot.restDay ? 'Rest day' : 'No pending sets'}
          </AppText>
          <AppText>
            {summary.actualCompleted === 0
              ? 'No sets logged. Review any omitted work before finishing.'
              : 'Review your logged sets and finish when you are ready.'}
          </AppText>
          {timer ? (
            <TimerReadout
              compact
              timer={timer}
              busy={busy || !ready}
              pause={() => fire(() => saveTimer(pauseTimer(timer, Date.now())))}
              resume={() => fire(() => saveTimer(resumeTimer(timer, Date.now())))}
            />
          ) : null}
        </Card>
      ) : null}
      {active && next ? (
        <AppText variant="caption" color="text2">
          {selection.following
            ? `Next set: ${itemView.items.find((item) => item.id === selection.following!.itemId)?.exercise.name}, set ${selection.following.setIndex + 1}. `
            : 'Last pending set. '}
          {preview
            ? `Next exercise: ${preview.ordinal}. ${preview.item.exercise.name}, ${preview.remaining} sets remaining.`
            : 'No other exercises pending.'}
        </AppText>
      ) : null}
      {active ? (
        <SessionExercises
          detail={current}
          selected={next?.itemId ?? null}
          busy={busy || correcting || workouts.stale || !!workouts.error || !summary.available}
          select={(itemId) => {
            setSelectedItemId(itemId);
            setLastSet(null);
            scroll.current?.scrollTo({ y: 0, animated: true });
          }}
          change={(item, change) =>
            run(async () => {
              await workouts.adjust({ kind: 'change', item, change });
              if (
                change.kind === 'state' &&
                change.state !== 'active' &&
                item.id === selectedItemId
              )
                setSelectedItemId(null);
              setLastSet(null);
            })
          }
          move={(item, direction) =>
            run(async () => {
              await workouts.adjust({ kind: 'move', item, order: itemView.items, direction });
              if (direction === 'later') setSelectedItemId(null);
              setLastSet(null);
            })
          }
          edit={(mode, item, id, exercise) =>
            run(async () => {
              if (mode === 'add') await workouts.adjust({ kind: 'add', id, exercise });
              else if (mode === 'replace' && item)
                await workouts.adjust({ kind: 'replace', item, id, exercise });
              else if (mode === 'targets' && item)
                await workouts.adjust({
                  kind: 'change',
                  item,
                  change: { kind: 'targets', targets: exercise },
                });
              else throw new Error('Choose an available session exercise.');
              if (mode !== 'targets') setSelectedItemId(id);
              setLastSet(null);
            })
          }
          editingChanged={setAdjusting}
        />
      ) : null}
      <Card>
        <AppText variant="label">{active ? 'In progress' : session.status}</AppText>
        <SessionClock startedAt={session.startedAt} endedAt={session.endedAt} />
        <AppText>
          {summary.completed} / {summary.total} current target sets logged
        </AppText>
        <AppText color="text2">
          Original routine: {summary.originalCompleted} / {summary.originalTotal} sets logged.
          Omitted: {summary.originalOmitted}. Additional logged sets: {summary.addedCompleted}.
        </AppText>
      </Card>
      {active ? (
        <>
          <Card>
            <TimerControls
              showReadout={!summary.available}
              timer={timer}
              busy={busy || !ready}
              start={(config) => fire(() => saveTimer(startTimer(config, Date.now(), randomId())))}
              pause={() => fire(() => saveTimer(timer ? pauseTimer(timer, Date.now()) : null))}
              resume={() => fire(() => saveTimer(timer ? resumeTimer(timer, Date.now()) : null))}
              clear={() => fire(() => saveTimer(null))}
            />
            <AppText variant="caption" color="text2">
              Rest alerts use your phone notifications. Silent mode and phone settings can suppress
              or delay them.
            </AppText>
            {alertError ? <AppText color="caution">{alertError}</AppText> : null}
            <Button
              label="Enable rest alerts"
              variant="secondary"
              disabled={busy || !ready}
              onPress={() =>
                fire(async () => {
                  try {
                    await enable();
                    await alerts.update(user, session.id, timer);
                  } catch (e) {
                    report(e);
                  }
                })
              }
            />
          </Card>
        </>
      ) : null}
      {summary.records
        .filter((r) => !active || r.setId === lastSet)
        .map((r) => (
          <AppText key={`${r.setId}/${r.record.metric}`} color="accent2">
            Personal record: {recordLabel(r.record, units)}
          </AppText>
        ))}
      {active ? (
        <>
          <Button
            label={session.easierToday ? 'Easier today: on' : 'Easier today: off'}
            variant="secondary"
            disabled={changesBlocked}
            onPress={() =>
              fire(async () => {
                await workouts.notes(session.id, notes, !session.easierToday);
              })
            }
          />
          <AppText variant="caption" color="text2">
            Changes future set prefills. Your current draft is kept.
          </AppText>
        </>
      ) : (
        <Card>
          <AppText variant="title">Session summary</AppText>
          <AppText>Volume: {volumeLabel(summary.volumeKg, units)}</AppText>
          {!summary.records.length ? (
            <AppText color="text2">No eligible personal records in this session.</AppText>
          ) : null}
        </Card>
      )}
      <LoggedSets
        user={user}
        session={session}
        logs={logs}
        items={itemView.items}
        units={units}
        busy={busy || adjusting || (active && !ready) || workouts.stale || !!workouts.error}
        actions={workouts}
        execute={run}
        editingChanged={setCorrecting}
        changed={() => setLastSet(null)}
        deleted={async (id) => {
          if (savedTimer?.sourceSetId === id) {
            try {
              await saveTimer(null);
            } catch {
              setReady(false);
              setError('Set deleted. Reset the saved timer before continuing.');
            }
          } else if (savedTimer) {
            setError('Set deleted. The timer was kept. Use Clear timer if you no longer need it.');
          }
        }}
      />
      <TextField
        label="Session notes"
        value={notes}
        onChangeText={setNotes}
        multiline
        editable={!changesBlocked}
      />
      <Button
        label="Save notes"
        variant="secondary"
        disabled={changesBlocked}
        onPress={() =>
          fire(async () => {
            await workouts.notes(session.id, notes, session.easierToday);
          })
        }
      />
      {active ? (
        <>
          {confirm ? (
            <Card>
              <AppText>
                {confirm === 'abandoned'
                  ? 'Abandon this session? Saved sets are kept, but the plan will not advance.'
                  : `Finish with ${summary.completed} of ${summary.total} current target sets logged? Original sets omitted: ${summary.originalOmitted}.`}
              </AppText>
              <Button
                label={confirm === 'abandoned' ? 'Confirm abandon' : 'Confirm finish'}
                disabled={changesBlocked}
                onPress={() => fire(() => finish(confirm))}
              />
              <Button
                label="Keep training"
                variant="secondary"
                disabled={busy}
                onPress={() => setConfirm(null)}
              />
            </Card>
          ) : (
            <>
              <Button
                label="Finish session"
                disabled={changesBlocked}
                onPress={() => setConfirm('completed')}
              />
              <Button
                label="Abandon session"
                disabled={changesBlocked}
                variant="secondary"
                onPress={() => setConfirm('abandoned')}
              />
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}
