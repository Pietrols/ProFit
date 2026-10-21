import { useDeferredValue, useMemo, useState } from 'react';
import { ExerciseRow } from '../exercises/ExerciseRow';
import { searchExercises } from '../exercises/search';
import type { Exercise } from '../exercises/types';
import { useExerciseLibrary } from '../exercises/useExerciseLibrary';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { SearchField } from '@/ui/SearchField';

export function WorkoutExercisePicker({
  busy,
  choose,
}: {
  busy: boolean;
  choose: (exercise: Exercise) => void;
}) {
  const { exercises, favourites, error, retry, toggleFavourite } = useExerciseLibrary();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const [favouriteError, setFavouriteError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(
    () => (exercises ? searchExercises(exercises, deferredQuery, {}, favourites) : null),
    [exercises, deferredQuery, favourites],
  );
  if (error)
    return (
      <EmptyState
        icon="warning-outline"
        title="Could not load exercises"
        message={error}
        actionLabel="Retry library"
        onAction={retry}
      />
    );
  if (!matches) return <AppText color="text2">Loading exercises</AppText>;
  return (
    <>
      <SearchField
        label="Find an exercise for this workout"
        placeholder="Search by name, muscle or equipment"
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          setLimit(20);
        }}
      />
      {favouriteError ? <AppText color="caution">{favouriteError}</AppText> : null}
      {!matches.length ? (
        <EmptyState
          icon="search-outline"
          title="No matching exercises"
          message="Try another name or muscle. Your saved custom exercises are included."
        />
      ) : null}
      {matches.slice(0, limit).map((exercise) => (
        <ExerciseRow
          key={exercise.id}
          exercise={exercise}
          favourite={favourites.has(exercise.id)}
          onPress={() => {
            if (!busy) choose(exercise);
          }}
          onToggleFavourite={(id) => {
            if (busy) return;
            setFavouriteError(null);
            void toggleFavourite(id).catch((error: unknown) => {
              setFavouriteError(
                error instanceof Error ? error.message : 'Could not save the favourite.',
              );
              retry();
            });
          }}
        />
      ))}
      {matches.length > limit ? (
        <Button
          label="Show more exercises"
          variant="secondary"
          disabled={busy}
          onPress={() => setLimit((value) => value + 20)}
        />
      ) : null}
    </>
  );
}
