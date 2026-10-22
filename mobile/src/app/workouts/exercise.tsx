import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useMe } from '@/features/auth/AuthProvider';
import { SyncBanner } from '@/features/sync/SyncBanner';
import { ExercisePerformanceCard } from '@/features/workouts/ExercisePerformanceCard';
import {
  readExercisePerformances,
  type ExerciseCursor,
  type ExercisePerformancesPage,
} from '@/features/workouts/exercisePerformances';
import { previousWorkoutPerformance } from '@/features/workouts/performanceComparison';
import { useWorkoutQuery } from '@/features/workouts/useWorkoutQuery';
import type { Database } from '@/lib/db/database';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';

export default function ExerciseHistoryScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ exerciseId?: string; name?: string }>();
  if (auth.status !== 'signedIn') return null;
  const exerciseId = typeof params.exerciseId === 'string' ? params.exerciseId : '';
  const name = typeof params.name === 'string' ? params.name.slice(0, 200) : exerciseId;
  return <Performances key={`${auth.userId}/${exerciseId}`} exerciseId={exerciseId} name={name} />;
}

function Performances({ exerciseId, name }: { exerciseId: string; name: string }) {
  const { colors, space } = useAppTheme();
  const { me } = useMe();
  const units = me?.profile.unitSystem ?? 'metric';
  const [cursors, setCursors] = useState<ExerciseCursor[]>([]);
  const cursor = cursors.at(-1) ?? null;
  const load = useCallback(
    (db: Database, user: string) => readExercisePerformances(db, user, exerciseId, cursor),
    [exerciseId, cursor],
  );
  const query = useWorkoutQuery(`exercise-history:${JSON.stringify([exerciseId, cursor])}`, load);
  const list = useRef<FlatList<ExercisePerformancesPage['entries'][number]>>(null);
  const top = () => list.current?.scrollToOffset({ offset: 0, animated: false });
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        ref={list}
        data={query.data?.entries ?? []}
        keyExtractor={(entry) => entry.id}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingVertical: space.lg,
          gap: space.md,
        }}
        ListHeaderComponent={
          <View style={{ gap: space.lg }}>
            <AppText variant="display" accessibilityRole="header">
              Recent exercise results
            </AppText>
            <AppText variant="title">{name || 'Choose an exercise'}</AppText>
            <SyncBanner />
            <AppText color="text2">
              Completed workouts, newest performance first. Changes compare with an earlier workout
              on this page, using matching recorded fields and load. A larger number is not always
              better.
            </AppText>
            <Button
              label="Workouts with this exercise"
              variant="secondary"
              onPress={() => router.push({ pathname: '/workouts/history', params: { exerciseId } })}
            />
            {query.error ? (
              <>
                <AppText color="caution">Could not read exercise results: {query.error}</AppText>
                <Button label="Retry exercise results" onPress={query.retry} />
              </>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <ExercisePerformanceCard
            entry={item}
            previous={previousWorkoutPerformance(query.data?.entries ?? [], index)}
            units={units}
            open={() => router.push({ pathname: '/workouts/[id]', params: { id: item.sessionId } })}
          />
        )}
        ListEmptyComponent={
          !query.error ? (
            <EmptyState
              icon="barbell-outline"
              title={query.loaded ? 'No completed results here' : 'Loading exercise results'}
              message={
                query.loaded
                  ? 'Log this exercise and finish the workout to see its results. Abandoned and incomplete work remains in workout history.'
                  : 'Reading saved performances for this exercise.'
              }
            />
          ) : null
        }
        ListFooterComponent={
          <View style={{ gap: space.md, marginTop: space.lg }}>
            <AppText color="text2" accessibilityLiveRegion="polite">
              Page {cursors.length + 1} · Up to 25 results
            </AppText>
            {cursors.length ? (
              <Button
                label="Previous results page"
                variant="secondary"
                disabled={!query.loaded || !!query.error}
                onPress={() => {
                  setCursors((previous) => previous.slice(0, -1));
                  top();
                }}
              />
            ) : null}
            {query.data?.next ? (
              <Button
                label="Older exercise results"
                disabled={!query.loaded || !!query.error}
                onPress={() => {
                  const next = query.data?.next;
                  if (next) {
                    setCursors((previous) => [...previous, next]);
                    top();
                  }
                }}
              />
            ) : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}
