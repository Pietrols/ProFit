import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { getDb } from '../../data/db';
import { listSessionsLocal } from '../../data/workoutRepo';
import { WorkoutSessionPayload } from '../../data/workoutTypes';
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
import { HomeStackParamList } from '../home/HomeStack';

export function WorkoutSummaryScreen() {
  const t = useAppTheme();
  const route = useRoute<RouteProp<HomeStackParamList, 'WorkoutSummary'>>();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [session, setSession] = useState<WorkoutSessionPayload | null>(null);
  const [synced, setSynced] = useState(route.params.synced);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const all = await listSessionsLocal(db);
      const row = all.find((r) => r.payload.id === route.params.sessionId);
      setSession(row?.payload ?? null);
      if (row?.synced) setSynced(true);
      setStatus(row ? 'ready' : 'missing');
    })();
  }, [route.params.sessionId]);

  if (status === 'loading') {
    return <Screen><LoadingView /></Screen>;
  }
  if (status === 'missing' || !session) {
    return (
      <Screen>
        <EmptyView title="Session not found" hint="The log may not have been saved." />
      </Screen>
    );
  }

  const d = session.delta;
  const adherence =
    d.plannedSetCount > 0
      ? Math.round((d.completedSetCount / d.plannedSetCount) * 100)
      : 100;
  const minutes = Math.round(session.durationSeconds / 60);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Title>Session done</Title>
        <AccentRule />

        <View style={{ flexDirection: 'row', gap: t.spacing.md, marginBottom: t.spacing.xl }}>
          <Stat label="Duration" value={`${minutes} min`} />
          <Stat label="Sets" value={`${d.completedSetCount}/${d.plannedSetCount}`} />
          <Stat label="Adherence" value={`${adherence}%`} accent={adherence >= 80 ? 'green' : 'red'} />
        </View>

        <Heading>Planned vs actual</Heading>
        <View style={{ marginTop: t.spacing.md, gap: t.spacing.sm, marginBottom: t.spacing.xl }}>
          <Body muted>
            {`Exercises completed: ${d.completedExerciseCount} of ${d.plannedExerciseCount}`}
          </Body>
          {d.skippedExercises.length > 0 && (
            <Body muted>{`Skipped: ${d.skippedExercises.map((s) => s.name).join(', ')}`}</Body>
          )}
          {d.swappedExercises.length > 0 && (
            <Body muted>{`Swapped: ${d.swappedExercises
              .map((s) => `${s.fromExerciseId} → ${s.toExerciseId}`)
              .join(', ')}`}</Body>
          )}
          {d.cutShort && <Body muted>Session ended with planned work remaining.</Body>}
        </View>

        <View
          style={{
            backgroundColor: synced ? t.colors.gdim : t.colors.bdim,
            borderRadius: t.radius.md,
            padding: t.spacing.md,
            marginBottom: t.spacing.xl,
          }}
        >
          <Text
            style={{
              fontFamily: t.typography.body,
              color: synced ? t.colors.green : t.colors.blue,
            }}
          >
            {synced
              ? 'Synced to your account.'
              : 'Saved on this device — will sync automatically when online.'}
          </Text>
        </View>

        <Button label="Back home" onPress={() => nav.popToTop()} />
      </ScrollView>
    </Screen>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'green' | 'red';
}) {
  const t = useAppTheme();
  const color =
    accent === 'green' ? t.colors.green : accent === 'red' ? t.colors.red : t.colors.tx;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.s1,
        borderRadius: t.radius.lg,
        padding: t.spacing.md,
        alignItems: 'center',
      }}
    >
      <Text style={{ fontFamily: t.typography.display, fontSize: 26, color }}>{value}</Text>
      <Text
        style={{
          fontFamily: t.typography.label,
          fontSize: 11,
          color: t.colors.tx2,
          textTransform: 'uppercase',
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
