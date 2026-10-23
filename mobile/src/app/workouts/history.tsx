import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthProvider';
import { SyncBanner } from '@/features/sync/SyncBanner';
import { useWorkoutHistory } from '@/features/workouts/useWorkoutHistory';
import { WorkoutHistoryEntry } from '@/features/workouts/WorkoutHistoryEntry';
import { WorkoutHistoryFilters } from '@/features/workouts/WorkoutHistoryFilters';
import { WorkoutResume } from '@/features/workouts/WorkoutResume';
import type { WorkoutHistoryPage } from '@/features/workouts/workoutHistory';
import type {
  WorkoutCursor,
  WorkoutHistoryFilters as Filters,
} from '@/features/workouts/workoutReads';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';

export default function WorkoutHistoryScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ planId?: string; exerciseId?: string }>();
  if (auth.status !== 'signedIn') return null;
  const planId = typeof params.planId === 'string' ? params.planId : null;
  const exerciseId = typeof params.exerciseId === 'string' ? params.exerciseId : null;
  return (
    <History
      key={`${auth.userId}/${planId}/${exerciseId}`}
      initial={{ status: 'saved', planId, exerciseId }}
    />
  );
}

function History({ initial }: { initial: Filters }) {
  const { colors, space } = useAppTheme();
  const [filters, setFilters] = useState(initial);
  const [cursors, setCursors] = useState<WorkoutCursor[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const query = useWorkoutHistory(filters, cursors.at(-1) ?? null);
  const list = useRef<FlatList<WorkoutHistoryPage['entries'][number]>>(null);
  const moveToTop = () => list.current?.scrollToOffset({ offset: 0, animated: false });
  const apply = (next: Filters) => {
    setFilters(next);
    setCursors([]);
    moveToTop();
  };
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        ref={list}
        data={query.data?.entries ?? []}
        keyExtractor={(entry) => entry.session.id}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingVertical: space.lg,
          gap: space.md,
        }}
        ListHeaderComponent={
          <View style={{ gap: space.lg }}>
            <AppText variant="display" accessibilityRole="header">
              Workout history
            </AppText>
            <SyncBanner />
            <WorkoutResume />
            <Button
              label={showFilters ? 'Hide history filters' : 'Filter workout history'}
              variant="secondary"
              onPress={() => setShowFilters(!showFilters)}
            />
            {showFilters ? (
              <WorkoutHistoryFilters
                key={JSON.stringify(filters)}
                initial={filters}
                apply={apply}
              />
            ) : null}
            {filters.planId ||
            filters.exerciseId ||
            filters.planName ||
            filters.exerciseName ||
            (filters.status && filters.status !== 'saved') ? (
              <Button
                label="Show all saved workouts"
                variant="secondary"
                onPress={() => apply({ status: 'saved' })}
              />
            ) : null}
            {query.error ? (
              <>
                <AppText color="caution">Could not read history: {query.error}</AppText>
                <Button label="Retry workout history" onPress={query.retry} />
              </>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <WorkoutHistoryEntry
            entry={item}
            open={() =>
              router.push({ pathname: '/workouts/[id]', params: { id: item.session.id } })
            }
            filterPlan={() => apply({ status: 'saved', planId: item.session.planId })}
          />
        )}
        ListEmptyComponent={
          !query.error ? (
            <EmptyState
              icon="barbell-outline"
              title={query.loaded ? 'No saved workouts here' : 'Loading workout history'}
              message={
                query.loaded
                  ? 'Complete a workout, or change the history filters to see other sessions. Saved workouts remain available offline.'
                  : 'Reading this page from your phone.'
              }
            />
          ) : null
        }
        ListFooterComponent={
          <View style={{ gap: space.md, marginTop: space.lg }}>
            <AppText color="text2" accessibilityLiveRegion="polite">
              Page {cursors.length + 1} · Up to 25 saved workouts
            </AppText>
            {cursors.length ? (
              <Button
                label="Previous history page"
                variant="secondary"
                disabled={!query.loaded || !!query.error}
                onPress={() => {
                  setCursors((previous) => previous.slice(0, -1));
                  moveToTop();
                }}
              />
            ) : null}
            {query.data?.next ? (
              <Button
                label="Older workouts"
                disabled={!query.loaded || !!query.error}
                onPress={() => {
                  const next = query.data?.next;
                  if (next) {
                    setCursors((previous) => [...previous, next]);
                    moveToTop();
                  }
                }}
              />
            ) : null}
            <Button
              label="Newest workouts"
              variant="secondary"
              disabled={!query.loaded && !query.error}
              onPress={() => {
                setCursors([]);
                moveToTop();
                if (!cursors.length) query.retry();
              }}
            />
          </View>
        }
      />
    </SafeAreaView>
  );
}
