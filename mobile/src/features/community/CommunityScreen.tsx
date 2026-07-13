import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { api, NetworkError } from '../../api/client';
import { UserWorkout } from '../../data/communityTypes';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Button,
  ChipRow,
  EmptyView,
  ErrorBanner,
  LoadingView,
  Screen,
  Title,
} from '../../ui';
import { useAuth } from '../auth/AuthContext';
import { CommunityStackParamList } from './CommunityStack';

type Tab = 'public' | 'mine';

export function CommunityScreen() {
  const t = useAppTheme();
  const { session } = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const [tab, setTab] = useState<Tab>('public');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [workouts, setWorkouts] = useState<UserWorkout[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    setStatus('loading');
    try {
      const res =
        tab === 'public'
          ? await api.publicWorkouts(session.token)
          : await api.myWorkouts(session.token);
      setWorkouts(res.workouts);
      setStatus('ready');
    } catch (e) {
      setStatus(e instanceof NetworkError ? 'error' : 'error');
    }
  }, [session, tab]);

  // Reload on focus so a just-created workout shows up immediately.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <Title>Community</Title>
      <AccentRule />
      <View style={{ marginBottom: t.spacing.md }}>
        <ChipRow
          options={['public', 'mine'] as const}
          value={tab}
          onChange={setTab}
          labels={{ public: 'Discover', mine: 'My workouts' }}
        />
      </View>
      <Button label="Create a workout" onPress={() => nav.navigate('CreateWorkout')} />
      <View style={{ height: t.spacing.md }} />

      {status === 'loading' ? (
        <LoadingView />
      ) : status === 'error' ? (
        <ErrorBanner message="Community needs a connection. Try again when online." onRetry={load} />
      ) : workouts.length === 0 ? (
        <EmptyView
          title={tab === 'public' ? 'No public workouts yet' : 'You have no workouts yet'}
          hint={tab === 'public' ? 'Be the first to share one.' : 'Tap "Create a workout" above.'}
        />
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={(w) => w.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                tab === 'public' && nav.navigate('WorkoutDetail', { id: item.id })
              }
              style={({ pressed }) => ({
                backgroundColor: pressed ? t.colors.s2 : t.colors.s1,
                borderRadius: t.radius.lg,
                marginBottom: t.spacing.md,
                overflow: 'hidden',
              })}
            >
              {item.coverImage ? (
                <Image
                  source={{ uri: item.coverImage }}
                  style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: t.colors.s3 }}
                  contentFit="cover"
                />
              ) : null}
              <View style={{ padding: t.spacing.md }}>
                <Text style={{ fontFamily: t.typography.heading, fontSize: 17, color: t.colors.tx }}>
                  {item.name}
                </Text>
                <Text style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.tx2 }}>
                  {item.exercises.length} exercises
                  {tab === 'public' ? ` · by ${item.user.displayName}` : ''}
                  {!item.isPublic ? ' · private' : ''}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
