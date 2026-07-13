import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { api, NetworkError } from '../../api/client';
import { getDb } from '../../data/db';
import { UserWorkout } from '../../data/communityTypes';
import { saveActivePlan } from '../../data/planRepo';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Body,
  Button,
  EmptyView,
  Heading,
  LoadingView,
  Screen,
  Title,
} from '../../ui';
import { useAuth } from '../auth/AuthContext';
import { CommunityStackParamList } from './CommunityStack';

export function WorkoutDetailScreen() {
  const t = useAppTheme();
  const { session } = useAuth();
  const route = useRoute<RouteProp<CommunityStackParamList, 'WorkoutDetail'>>();
  const nav = useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [workout, setWorkout] = useState<UserWorkout | null>(null);
  const [copying, setCopying] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!session) return;
      try {
        const res = await api.publicWorkouts(session.token);
        const found = res.workouts.find((w) => w.id === route.params.id) ?? null;
        setWorkout(found);
        setStatus(found ? 'ready' : 'missing');
      } catch {
        setStatus('missing');
      }
    })();
  }, [session, route.params.id]);

  async function copy() {
    if (!session || !workout) return;
    setCopying(true);
    setNote(null);
    try {
      const { plan } = await api.copyWorkout(session.token, workout.id);
      await saveActivePlan(await getDb(), plan);
      setNote('Added to your plans — check Home.');
    } catch (e) {
      setNote(
        e instanceof NetworkError
          ? 'Copying needs a connection.'
          : 'Could not copy this workout.',
      );
    } finally {
      setCopying(false);
    }
  }

  if (status === 'loading') {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (status === 'missing' || !workout) {
    return (
      <Screen>
        <EmptyView title="Workout unavailable" hint="It may have been removed." />
        <Button label="Back" variant="ghost" onPress={() => nav.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Title>{workout.name}</Title>
        <AccentRule />
        {workout.coverImage ? (
          <Image
            source={{ uri: workout.coverImage }}
            style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: t.radius.xl, marginBottom: t.spacing.lg, backgroundColor: t.colors.s3 }}
            contentFit="cover"
          />
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          {workout.user.avatar ? (
            <Image
              source={{ uri: workout.user.avatar }}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.colors.s3 }}
              contentFit="cover"
            />
          ) : null}
          <View style={{ flexShrink: 1 }}>
            <Body muted>By {workout.user.displayName}</Body>
            {workout.user.publicBio ? (
              <Text style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.tx3 }}>
                {workout.user.publicBio}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ height: t.spacing.lg }} />
        <Heading>Exercises</Heading>
        <View style={{ marginTop: t.spacing.sm, gap: t.spacing.sm }}>
          {workout.exercises.map((pe) => (
            <View
              key={pe.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                borderBottomColor: t.colors.line,
                borderBottomWidth: 1,
                paddingBottom: t.spacing.sm,
              }}
            >
              <Text style={{ fontFamily: t.typography.body, fontSize: 14, color: t.colors.tx, flexShrink: 1 }} numberOfLines={1}>
                {pe.exercise.name}
              </Text>
              <Text style={{ fontFamily: t.typography.label, fontSize: 14, color: t.colors.tx2 }}>
                {pe.sets} × {pe.reps}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ height: t.spacing.xl }} />
        <Button label="Add to my plans" onPress={copy} busy={copying} />
        {note ? (
          <Text style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.tx2, marginTop: t.spacing.sm, textAlign: 'center' }}>
            {note}
          </Text>
        ) : null}
        <View style={{ height: t.spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
}
