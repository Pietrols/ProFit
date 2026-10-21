import { StartWorkout } from '@/features/workouts/StartWorkout';
import { useWorkoutOverview } from '@/features/workouts/useWorkoutOverview';
import { router, useLocalSearchParams } from 'expo-router';
import { useExerciseLibrary } from '@/features/exercises/useExerciseLibrary';
import { ExerciseTargets } from '@/features/plans/ExerciseTargets';
import { PlanState } from '@/features/plans/PlanState';
import { usePlans } from '@/features/plans/usePlans';
import { SyncBanner } from '@/features/sync/SyncBanner';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
export default function DayEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const plans = usePlans();
  const library = useExerciseLibrary();
  const day = plans.data?.days.find((d) => d.id === id);
  const plan = plans.data?.plans.find((p) => p.id === day?.planId);
  const workouts = useWorkoutOverview(plan?.id ?? null, !!plan);
  if (plans.error || library.error || !plans.data || !library.exercises)
    return (
      <PlanState
        error={plans.error ?? library.error}
        retry={() => {
          plans.retry();
          library.retry();
        }}
      />
    );
  if (!day || !plan) return <PlanState error={null} retry={plans.retry} missing />;
  const exercises = plans.data.exercises.filter((e) => e.dayId === day.id);
  return (
    <Screen title={day.name}>
      <SyncBanner />
      <StartWorkout
        plan={plan}
        day={day}
        exercises={exercises}
        names={new Map(library.exercises.map((e) => [e.id, e.name]))}
        workouts={workouts}
      />
      {day.restDay ? (
        <EmptyState
          icon="moon-outline"
          title="Rest day"
          message="Change this to a training day in the plan editor to add exercises. Existing targets are kept."
        />
      ) : (
        <Button
          label="Add exercise"
          onPress={() => router.push({ pathname: '/exercises', params: { dayId: day.id } })}
        />
      )}
      {!day.restDay && !exercises.length ? (
        <EmptyState
          icon="barbell-outline"
          title="No exercises yet"
          message="Pick from the library or add your own exercise there."
        />
      ) : null}
      <AppText color="text2">
        Targets use Standard difficulty. Change difficulty in the plan editor.
      </AppText>
      {!day.restDay
        ? exercises.map((exercise) => (
            <ExerciseTargets
              key={exercise.id}
              exercise={exercise}
              name={library.find(exercise.exerciseId)?.name ?? 'Exercise no longer in your library'}
              save={plans.saveExercise}
              remove={plans.removeExercise}
            />
          ))
        : null}
    </Screen>
  );
}
