import { Stack, useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExerciseRow } from '@/features/exercises/ExerciseRow';
import { LibraryFilters } from '@/features/exercises/LibraryFilters';
import { searchExercises, type Filters } from '@/features/exercises/search';
import { useExerciseLibrary } from '@/features/exercises/useExerciseLibrary';
import { SyncBanner } from '@/features/sync/SyncBanner';
import { useAppTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { EmptyState } from '@/ui/EmptyState';
import { SearchField } from '@/ui/SearchField';

export default function ExerciseLibraryScreen() {
  const { colors, space } = useAppTheme();
  const router = useRouter();
  const { exercises, favourites, error, toggleFavourite, retry } = useExerciseLibrary();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(
    () => (exercises ? searchExercises(exercises, deferredQuery, filters, favourites) : null),
    [exercises, deferredQuery, filters, favourites],
  );

  const open = useCallback((id: string) => router.push({ pathname: '/exercises/[id]', params: { id } }), [router]);
  const create = useCallback((name?: string) => router.push({ pathname: '/exercises/form', params: name ? { name } : {} }), [router]);
  const toggle = useCallback((id: string) => void toggleFavourite(id), [toggleFavourite]);

  const header = (
    <Stack.Screen
      options={{
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
