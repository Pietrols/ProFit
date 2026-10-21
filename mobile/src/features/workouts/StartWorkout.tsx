import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import type { Plan, PlanDay, PlanExercise } from '../plans/types';
import type { WorkoutOverviewState } from './useWorkoutOverview';
export function StartWorkout({
  plan,
  day,
  exercises,
  names,
  workouts,
}: {
  plan: Plan;
  day: PlanDay;
  exercises: PlanExercise[];
  names: ReadonlyMap<string, string>;
  workouts: WorkoutOverviewState;
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = workouts.data?.active ?? [];
  async function start() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const id = await workouts.start(plan, day, exercises, names);
      router.push({ pathname: '/workouts/[id]', params: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start workout.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {error || workouts.error ? (
        <>
          <AppText color="caution">{error ?? workouts.error}</AppText>
          <Button label="Retry workouts" variant="secondary" onPress={workouts.retry} />
        </>
      ) : null}
      {active.map((session) => (
        <Button
          key={session.id}
          label={`Resume ${session.snapshot.dayName}`}
          onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: session.id } })}
        />
      ))}
      {workouts.data?.hasMoreActive ? (
        <AppText color="text2">
          More active workouts are saved. Finish or abandon these before starting another.
        </AppText>
      ) : null}
      {!active.length ? (
        <Button
          label={
            workouts.data === null
              ? 'Loading workouts'
              : day.restDay
                ? 'Record rest day'
                : 'Start workout'
          }
          disabled={
            busy || !workouts.data || !!workouts.error || (!day.restDay && exercises.length === 0)
          }
          onPress={() => void start()}
        />
      ) : null}
    </>
  );
}
