import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { getDb } from '../../data/db';
import { getExercise } from '../../data/exercisesRepo';
import { Exercise, HOME_EQUIPMENT } from '../../data/types';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Body,
  EmptyView,
  Heading,
  LoadingView,
  Screen,
  Title,
} from '../../ui';
import { LibraryStackParamList } from './LibraryStack';

export function ExerciseDetailScreen() {
  const t = useAppTheme();
  const route = useRoute<RouteProp<LibraryStackParamList, 'ExerciseDetail'>>();
  const nav =
    useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [homeAlt, setHomeAlt] = useState<Exercise | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>(
    'loading',
  );

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const e = await getExercise(db, route.params.id);
      setExercise(e);
      setHomeAlt(
        e?.homeAlternativeId ? await getExercise(db, e.homeAlternativeId) : null,
      );
      setStatus(e ? 'ready' : 'missing');
    })();
  }, [route.params.id]);

  if (status === 'loading') {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (status === 'missing' || !exercise) {
    return (
      <Screen>
        <EmptyView
          title="Exercise not found"
          hint="It may have been removed — pull to refresh the library."
        />
      </Screen>
    );
  }

  const isHomeFriendly = exercise.equipment.some((e) =>
    HOME_EQUIPMENT.includes(e),
  );

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Title>{exercise.name}</Title>
        <AccentRule />
        <Image
          source={{ uri: exercise.demoUrl }}
          cachePolicy="disk"
          style={{
            width: '100%',
            aspectRatio: 4 / 3,
            borderRadius: t.radius.xl,
            backgroundColor: t.colors.s3,
            marginBottom: t.spacing.lg,
          }}
          contentFit="cover"
        />
        <Row label="Category" value={exercise.category} />
        <Row label="Primary" value={exercise.primaryMuscles.join(', ')} />
        {exercise.secondaryMuscles.length > 0 && (
          <Row label="Secondary" value={exercise.secondaryMuscles.join(', ')} />
        )}
        <Row
          label="Equipment"
          value={`${exercise.equipment.join(', ')}${isHomeFriendly ? '  ·  home-friendly' : ''}`}
        />

        {homeAlt ? (
          <View style={{ marginTop: t.spacing.xl }}>
            <Heading>Home alternative</Heading>
            <Pressable
              onPress={() => nav.push('ExerciseDetail', { id: homeAlt.id })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                backgroundColor: pressed ? t.colors.s2 : t.colors.s1,
                borderColor: t.colors.line,
                borderWidth: 1,
                borderRadius: t.radius.lg,
                padding: t.spacing.md,
                marginTop: t.spacing.sm,
              })}
            >
              <Image
                source={{ uri: homeAlt.demoUrl }}
                cachePolicy="disk"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: t.radius.md,
                  backgroundColor: t.colors.s3,
                }}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: t.typography.label,
                    fontSize: 15,
                    color: t.colors.tx,
                  }}
                >
                  {homeAlt.name}
                </Text>
                <Text
                  style={{
                    fontFamily: t.typography.body,
                    fontSize: 13,
                    color: t.colors.tx2,
                  }}
                >
                  {homeAlt.equipment.join(', ')}
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        <View style={{ marginTop: t.spacing.xl, marginBottom: t.spacing.xxl }}>
          <Heading>How to</Heading>
          <View style={{ marginTop: t.spacing.sm, gap: t.spacing.sm }}>
            {exercise.instructions.map((step, i) => (
              <Body key={i} muted>
                {`${i + 1}. ${step}`}
              </Body>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const t = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: t.spacing.sm,
        borderBottomColor: t.colors.line,
        borderBottomWidth: 1,
      }}
    >
      <Text
        style={{
          fontFamily: t.typography.label,
          fontSize: 13,
          color: t.colors.tx2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: t.typography.body,
          fontSize: 14,
          color: t.colors.tx,
          flexShrink: 1,
          textAlign: 'right',
        }}
      >
        {value}
      </Text>
    </View>
  );
}
