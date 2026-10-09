import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExerciseRow } from '@/features/exercises/ExerciseRow';
import { LibraryFilters } from '@/features/exercises/LibraryFilters';
import { searchExercises, type Filters } from '@/features/exercises/search';
import { useExerciseLibrary } from '@/features/exercises/useExerciseLibrary';
import { usePlans } from '@/features/plans/usePlans';
import { defaultLogFields } from '@/features/plans/logic';
import { nextPosition } from '@/features/plans/exerciseForm';
import { SyncBanner } from '@/features/sync/SyncBanner';
import { useAppTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { EmptyState } from '@/ui/EmptyState';
import { SearchField } from '@/ui/SearchField';

export default function ExerciseLibraryScreen() {
  const { colors, space } = useAppTheme();
  const router = useRouter();
  const { dayId, habit } = useLocalSearchParams<{ dayId?: string; habit?: string }>();
  const plans = usePlans();
  const [pickError, setPickError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const { exercises, favourites, error, toggleFavourite, retry } = useExerciseLibrary();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(
    () => (exercises ? searchExercises(exercises, deferredQuery, filters, favourites) : null),
    [exercises, deferredQuery, filters, favourites],
  );

  const open = useCallback((id: string) => {
    if (!dayId && habit !== '1') { router.push({ pathname: '/exercises/[id]', params: { id } }); return; }
    if (picking || !plans.data || !exercises) return;
    const chosen = exercises.find((exercise) => exercise.id === id); if (!chosen) return;
    setPicking(true); setPickError(null);
    const action = dayId ? plans.saveExercise({ dayId, exerciseId: id, position: nextPosition(plans.data.exercises.filter((e) => e.dayId === dayId)), sets: 3, targetReps: null, targetTimeSeconds: null, targetDistanceMetres: null, restSeconds: 60, logFields: defaultLogFields(chosen.tracking) }) : plans.saveHabit([...plans.data.habit, id]);
    void action.then(() => router.back(), (e: unknown) => setPickError(e instanceof Error ? e.message : 'Could not add the exercise.')).finally(() => setPicking(false));
  }, [dayId, habit, picking, plans, exercises, router]);
  const create = useCallback((name?: string) => router.push({ pathname: '/exercises/form', params: name ? { name } : {} }), [router]);
  const toggle = useCallback((id: string) => void toggleFavourite(id), [toggleFavourite]);

  const header = (
    <Stack.Screen
      options={{
        title: dayId || habit === '1' ? 'Pick an exercise' : 'Exercises',
        headerRight: () => (
          <Pressable accessibilityRole="button" accessibilityLabel="New exercise" onPress={() => create()} style={{ minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: space.sm }}>
            <AppText variant="bodyStrong" style={{ color: colors.accent }}>New</AppText>
          </Pressable>
        ),
      }}
    />
  );

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {header}
        <EmptyState icon="warning-outline" title="Could not load the library" message={error} actionLabel="Try again" onAction={retry} />
      </View>
    );
  }

  const trimmed = query.trim();
  let empty = null;
  if (results && results.length === 0) {
    empty = filters.favouritesOnly && !trimmed && !filters.muscle && !filters.equipment && !filters.category ? (
      <EmptyState icon="star-outline" title="No favourites yet" message="Tap the star next to an exercise to keep it here." />
    ) : (
      <EmptyState
        icon="search-outline"
        title="Nothing matches"
        message="Try fewer words or clear a filter. Or add it as your own exercise."
        actionLabel={trimmed ? `Add "${trimmed}"` : 'New exercise'}
        onAction={() => create(trimmed || undefined)}
      />
    );
  }

  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <FlatList
        data={results ?? []}
        keyExtractor={(x) => x.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingTop: space.md, paddingBottom: space.sm }}>
            <SyncBanner />
            {dayId || habit === '1' ? <AppText color="text2">Tap an exercise to add it.{picking ? ' Saving…' : ''}</AppText> : null}
            {pickError || plans.error ? <AppText color="caution" accessibilityLiveRegion="polite">{pickError ?? plans.error}</AppText> : null}
            <SearchField label="Search exercises" placeholder="Search by name, muscle or equipment" value={query} onChangeText={setQuery} />
            <LibraryFilters filters={filters} onChange={setFilters} />
            {results ? (
              <AppText variant="caption" color="text2" accessibilityLiveRegion="polite">
                {results.length === 1 ? '1 exercise' : `${results.length} exercises`}
              </AppText>
            ) : null}
          </View>
        }
        ListEmptyComponent={results ? empty : <AppText color="text2">Loading the library…</AppText>}
        renderItem={({ item }) => <ExerciseRow exercise={item} favourite={favourites.has(item.id)} onPress={open} onToggleFavourite={toggle} />}
      />
    </SafeAreaView>
  );
}
