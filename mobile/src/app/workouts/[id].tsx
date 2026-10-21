import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useMe } from '@/features/auth/AuthProvider';
import { SyncBanner } from '@/features/sync/SyncBanner';
import {
  prefill,
  sessionSummary,
  sessionTargets,
  type WorkoutHistory,
} from '@/features/workouts/logic';
import { SetForm } from '@/features/workouts/SetForm';
import { TimerControls } from '@/features/workouts/TimerControls';
import {
  loadWorkoutTimer,
  saveWorkoutTimer,
  timerAfterLogs,
} from '@/features/workouts/timerStorage';
import {
  formatTimer,
  pauseTimer,
  resumeTimer,
  sessionClock,
  startTimer,
  type TimerState,
} from '@/features/workouts/timers';
import { useWorkouts } from '@/features/workouts/useWorkouts';
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
  const workouts = useWorkouts();
  if (!workouts.data)
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
  const current = workouts.data.find((h) => h.session.id === id);
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
  current: WorkoutHistory;
  workouts: ReturnType<typeof useWorkouts>;
  user: string;
}) {
  const { session, logs } = current;
  const { me } = useMe();
  const units = me?.profile.unitSystem ?? 'metric';
  const { alerts, error: alertError, report, enable } = useWorkoutAlerts();
  const [now, setNow] = useState(Date.now());
  const [notes, setNotes] = useState(session.notes);
  const timerVersion = useRef(0);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [confirm, setConfirm] = useState<'completed' | 'abandoned' | null>(null);
  const [lastSet, setLastSet] = useState<string | null>(null);
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(handle);
  }, []);
  useEffect(() => {
    let live = true;
    const version = ++timerVersion.current;
    loadWorkoutTimer(kvStore, user, session.id).then(
      (value) => {
        if (live && version === timerVersion.current) {
          setTimer(
            timerAfterLogs(
              value,
              logs.map((log) => log.loggedAt),
            ),
          );
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
  const summary = sessionSummary(session, logs, workouts.data ?? [], new Date(now).toISOString());
  const active = session.status === 'active';
  const next = summary.next;
  const awakeError = useWorkoutAwake(active);
  useEffect(() => {
    if (ready || !active) void alerts.update(user, session.id, active ? timer : null).catch(report);
  }, [alerts, user, session.id, active, ready, timer]);
  const exercise = next ? session.snapshot.exercises[next.exercisePosition]! : null;
  const initial = exercise
    ? prefill(
        exercise,
        sessionTargets(exercise, session.snapshot.difficulty, session.easierToday),
        workouts.data ?? [],
        session.startedAt,
      )
    : {};
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
            ? startTimer({ mode: 'rest', seconds: exercise!.restSeconds }, Date.now(), randomId())
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
        <AppText variant="display">
          {formatTimer(
            sessionClock(
              Date.parse(session.startedAt),
              session.endedAt ? Date.parse(session.endedAt) : null,
              now,
            ),
          )}
        </AppText>
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
              now={now}
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
            busy={busy || !ready}
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
