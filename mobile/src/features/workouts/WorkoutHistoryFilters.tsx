import { useState } from 'react';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ChipGroup } from '@/ui/ChipGroup';
import { TextField } from '@/ui/TextField';
import type { WorkoutHistoryFilters as Filters } from './workoutReads';

export function WorkoutHistoryFilters({
  initial,
  apply,
}: {
  initial: Filters;
  apply: (filters: Filters) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <Card>
      <AppText variant="label">Filter saved workouts</AppText>
      <ChipGroup
        label="Status"
        value={draft.status ?? 'saved'}
        clearable={false}
        options={[
          { value: 'saved', label: 'All saved' },
          { value: 'completed', label: 'Completed' },
          { value: 'abandoned', label: 'Abandoned' },
          { value: 'rest', label: 'Rest days' },
        ]}
        onChange={(status) => setDraft({ ...draft, status: status ?? 'saved' })}
      />
      {draft.planId ? (
        <AppText color="text2">
          Filtering the selected plan. Clear filters to search all plans.
        </AppText>
      ) : null}
      <TextField
        label="Plan name"
        value={draft.planName ?? ''}
        maxLength={200}
        editable={!draft.planId}
        onChangeText={(planName) => setDraft({ ...draft, planName })}
      />
      {draft.exerciseId ? (
        <AppText color="text2">
          Filtering the selected exercise. Clear filters to search all exercises.
        </AppText>
      ) : null}
      <TextField
        label="Exercise name"
        value={draft.exerciseName ?? ''}
        maxLength={200}
        editable={!draft.exerciseId}
        onChangeText={(exerciseName) => setDraft({ ...draft, exerciseName })}
      />
      <AppText variant="caption" color="text2">
        Search uses names saved with the workout, including routines later renamed or deleted.
      </AppText>
      <Button label="Apply history filters" onPress={() => apply(draft)} />
      <Button
        label="Clear history filters"
        variant="secondary"
        onPress={() => {
          const cleared: Filters = { status: 'saved' };
          setDraft(cleared);
          apply(cleared);
        }}
      />
    </Card>
  );
}
