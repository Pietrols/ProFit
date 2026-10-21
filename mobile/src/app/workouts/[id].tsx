import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMe } from '@/features/auth/AuthProvider';
import { SyncBanner } from '@/features/sync/SyncBanner';
import {
  completedSets,
  prefillFromSets,
  sessionResultsFromSets,
  sessionTargets,
} from '@/features/workouts/logic';
import { SetForm } from '@/features/workouts/SetForm';
import { TimerControls } from '@/features/workouts/TimerControls';
import { SessionClock } from '@/features/workouts/SessionClock';
import { LoggedSets } from '@/features/workouts/LoggedSets';
import {
  loadWorkoutTimer,
  saveWorkoutTimer,
  timerAfterLogs,
} from '@/features/workouts/timerStorage';
import { pauseTimer, resumeTimer, startTimer, type TimerState } from '@/features/workouts/timers';
import { useWorkout } from '@/features/workouts/useWorkout';
import type { WorkoutDetail } from '@/features/workouts/workoutDetail';
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
  current: WorkoutDetail;
  workouts: ReturnType<typeof useWorkout>;
  user: string;
}) {
  const { session, logs } = current;
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
        completedSets(session, logs).map((log) => log.id),
      ),
    [savedTimer, session, logs],
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [confirm, setConfirm] = useState<'completed' | 'abandoned' | null>(null);
  const [lastSet, setLastSet] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
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
  const summary = useMemo(
    () => sessionResultsFromSets(session, logs, current.previousSets),
    [session, logs, current.previousSets],
  );
  const active = session.status === 'active';
  const next = summary.next;
  const awakeError = useWorkoutAwake(active);
  useEffect(() => {
    if (ready || !active) void alerts.update(user, session.id, active ? timer : null).catch(report);
  }, [alerts, user, session.id, active, ready, timer, report]);
  const exercise = next ? session.snapshot.exercises[next.exercisePosition]! : null;
  const initial = useMemo(
    () =>
      exercise
        ? prefillFromSets(
            exercise,
            sessionTargets(exercise, session.snapshot.difficulty, session.easierToday),
            current.previousSets,
          )
        : {},
    [exercise, session.snapshot.difficulty, session.easierToday, current.previousSets],
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
    if (!next || !exercise) return;
    await run(async () => {
      const id = await workouts.log({
        sessionId: session.id,
        exercisePosition: next!.exercisePosition,
        setIndex: next!.setIndex,
        loggedAt: new Date().toISOString(),
        logFields: exercise!.logFields,
        values,
      });
      setLastSet(id);
      try {
        await saveTimer(
          exercise!.restSeconds
            ? {
                ...startTimer(
                  { mode: 'rest', seconds: exercise!.restSeconds },
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
    <Screen title={session.snapshot.dayName}>
      <SyncBanner />
      <Card>
        <AppText variant="label">{active ? 'In progress' : session.status}</AppText>
        <SessionClock startedAt={session.startedAt} endedAt={session.endedAt} />
        <AppText>
          {summary.completed} / {summary.total} sets logged
        </AppText>
      </Card>
      {workouts.error ? (
        <>
          <AppText color="caution">{workouts.error}</AppText>
          <Button label="Retry workout read" variant="secondary" onPress={workouts.retry} />
        </>
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
      {active ? (
        <>
          <Card>
            <TimerControls
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
      {active && exercise && next ? (
        <Card>
          <AppText variant="title">{exercise.name}</AppText>
          <AppText color="text2">{setLabel(next.setIndex, exercise.sets)}</AppText>
          <SetForm
            key={`${next.exercisePosition}/${next.setIndex}/${units}`}
            exercise={exercise}
            initial={initial}
            units={units}
            busy={busy || correcting || !ready || workouts.stale || !!workouts.error}
            onLog={log}
          />
        </Card>
      ) : active ? (
        <Card>
          <AppText variant="title">
            {session.snapshot.restDay ? 'Rest day' : 'All planned sets logged'}
          </AppText>
          <AppText>Finish when you are ready.</AppText>
        </Card>
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
            disabled={busy}
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
        session={session}
        logs={logs}
        units={units}
        busy={busy || (active && !ready) || workouts.stale || !!workouts.error}
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
        editable={!busy}
      />
      <Button
        label="Save notes"
        variant="secondary"
        disabled={busy}
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
                  : `Finish with ${summary.completed} of ${summary.total} sets logged?`}
              </AppText>
              <Button
                label={confirm === 'abandoned' ? 'Confirm abandon' : 'Confirm finish'}
                disabled={busy}
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
                disabled={busy}
                onPress={() => setConfirm('completed')}
              />
              <Button
                label="Abandon session"
                disabled={busy}
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
