import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { getDb } from '../../data/db';
import { getExercise } from '../../data/exercisesRepo';
import { Exercise } from '../../data/types';
import { saveSessionLocal } from '../../data/workoutRepo';
import {
  SessionExercise,
  SwapReason,
  WorkoutSessionPayload,
} from '../../data/workoutTypes';
import { useAppTheme } from '../../theme/ThemeContext';
import { Button, Heading, Screen } from '../../ui';
import { useUser } from '../auth/AuthContext';
import { HomeStackParamList } from '../home/HomeStack';
import { computeDelta, fromKg, toKg } from './computeDelta';
import { useWorkoutSync } from './useWorkoutSync';

interface SetDraft {
  id: string;
  plannedReps: string | null;
  reps: string; // text field, user units
  weight: string;
  completed: boolean;
}

interface ExerciseDraft {
  id: string;
  plannedExerciseId: string | null;
  actual: Exercise;
  skipped: boolean;
  swapReason?: SwapReason;
  sets: SetDraft[];
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ActiveWorkoutScreen() {
  const t = useAppTheme();
  const user = useUser();
  const route = useRoute<RouteProp<HomeStackParamList, 'ActiveWorkout'>>();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { push } = useWorkoutSync();
  const { day, planId } = route.params;

  const startedAt = useRef(new Date()).current;
  const sessionId = useRef(Crypto.randomUUID()).current;
  const [elapsed, setElapsed] = useState(0);
  const [rest, setRest] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<ExerciseDraft[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [finishing, setFinishing] = useState(false);

  // Build drafts from the plan day, resolving exercises from device SQLite.
  useEffect(() => {
    (async () => {
      const db = await getDb();
      const built: ExerciseDraft[] = [];
      for (const pe of day.exercises) {
        const ex = (await getExercise(db, pe.exerciseId)) ?? pe.exercise;
        built.push({
          id: Crypto.randomUUID(),
          plannedExerciseId: pe.exerciseId,
          actual: ex,
          skipped: false,
          sets: Array.from({ length: pe.sets }, () => ({
            id: Crypto.randomUUID(),
            plannedReps: pe.reps,
            reps: '',
            weight: '',
            completed: false,
          })),
        });
      }
      setDrafts(built);
    })();
  }, [day]);

  // Session clock
  useEffect(() => {
    const iv = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000)),
      1000,
    );
    return () => clearInterval(iv);
  }, [startedAt]);

  // Rest countdown
  useEffect(() => {
    if (rest === null) return;
    if (rest <= 0) {
      setRest(null);
      return;
    }
    const iv = setTimeout(() => setRest((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(iv);
  }, [rest]);

  const restSecondsFor = (index: number) =>
    day.exercises[Math.min(index, day.exercises.length - 1)]?.restSeconds ?? 90;

  function updateSet(exIdx: number, setIdx: number, patch: Partial<SetDraft>) {
    setDrafts((prev) => {
      if (!prev) return prev;
      const next = prev.map((e, i) =>
        i === exIdx
          ? { ...e, sets: e.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)) }
          : e,
      );
      return next;
    });
  }

  function completeSet(exIdx: number, setIdx: number) {
    const set = drafts![exIdx].sets[setIdx];
    updateSet(exIdx, setIdx, { completed: !set.completed });
    if (!set.completed) setRest(restSecondsFor(exIdx));
  }

  async function swapExercise(exIdx: number) {
    const draft = drafts![exIdx];
    const altId = draft.actual.homeAlternativeId;
    if (!altId) {
      Alert.alert('No alternative', 'This exercise has no curated alternative yet.');
      return;
    }
    const db = await getDb();
    const alt = await getExercise(db, altId);
    if (!alt) return;
    setDrafts((prev) =>
      prev!.map((e, i) =>
        i === exIdx ? { ...e, actual: alt, swapReason: 'equipment' as const } : e,
      ),
    );
  }

  function skipExercise(exIdx: number) {
    setDrafts((prev) =>
      prev!.map((e, i) => (i === exIdx ? { ...e, skipped: !e.skipped } : e)),
    );
  }

  async function finish() {
    if (!drafts || finishing) return;
    setFinishing(true);
    try {
      const finishedAt = new Date();
      const exercises: SessionExercise[] = drafts.map((d, order) => ({
        id: d.id,
        order,
        plannedExerciseId: d.plannedExerciseId,
        actualExerciseId: d.actual.id,
        skipped: d.skipped,
        sets: d.skipped
          ? []
          : d.sets.map((s, setIndex) => ({
              id: s.id,
              setIndex,
              plannedReps: s.plannedReps,
              actualReps: s.completed && s.reps ? Number(s.reps) || 0 : null,
              weightKg:
                s.completed && s.weight
                  ? Math.round(toKg(Number(s.weight) || 0, user.units) * 100) / 100
                  : null,
              completed: s.completed,
            })),
      }));

      const names = new Map(drafts.map((d) => [d.actual.id, d.actual.name]));
      drafts.forEach((d) => {
        if (d.plannedExerciseId) names.set(d.plannedExerciseId, names.get(d.plannedExerciseId) ?? d.actual.name);
      });
      const swapReasons = new Map(
        drafts.filter((d) => d.swapReason).map((d) => [d.id, d.swapReason!]),
      );

      const payload: WorkoutSessionPayload = {
        id: sessionId,
        planId,
        planDayId: day.id,
        dayName: day.name,
        category: day.category,
        context: user.defaultContext,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationSeconds: Math.floor(
          (finishedAt.getTime() - startedAt.getTime()) / 1000,
        ),
        delta: computeDelta(day, exercises, names, swapReasons),
        exercises,
      };

      // SQLite first — the workout is safe on device even with no signal.
      await saveSessionLocal(await getDb(), payload);
      const synced = await push();
      nav.replace('WorkoutSummary', { sessionId: payload.id, synced });
    } finally {
      setFinishing(false);
    }
  }

  if (!drafts) {
    return <Screen><Heading>Loading session…</Heading></Screen>;
  }

  const draft = drafts[current];
  const doneSets = drafts.flatMap((d) => d.sets).filter((s) => s.completed).length;
  const totalSets = drafts.reduce((n, d) => n + (d.skipped ? 0 : d.sets.length), 0);

  return (
    <Screen>
      {/* Session header: clock + progress */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontFamily: t.typography.display, fontSize: 40, color: t.colors.tx }}>
          {formatClock(elapsed)}
        </Text>
        <Text style={{ fontFamily: t.typography.label, fontSize: 14, color: t.colors.tx2 }}>
          {day.name} · {doneSets}/{totalSets} sets
        </Text>
      </View>

      {/* Rest timer — glows while running */}
      {rest !== null && (
        <View
          style={[
            {
              backgroundColor: t.colors.gdim,
              borderRadius: t.radius.md,
              padding: t.spacing.md,
              marginTop: t.spacing.md,
              alignItems: 'center',
            },
            t.glow(t.colors.gGlow),
          ]}
        >
          <Text style={{ fontFamily: t.typography.display, fontSize: 28, color: t.colors.green }}>
            REST {formatClock(rest)}
          </Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: t.spacing.lg }}>
        {/* Exercise pager */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable disabled={current === 0} onPress={() => setCurrent((c) => c - 1)}>
            <Text style={{ fontFamily: t.typography.label, fontSize: 14, color: current === 0 ? t.colors.tx3 : t.colors.tx }}>‹ PREV</Text>
          </Pressable>
          <Text style={{ fontFamily: t.typography.label, fontSize: 13, color: t.colors.tx2 }}>
            {current + 1} / {drafts.length}
          </Text>
          <Pressable disabled={current === drafts.length - 1} onPress={() => setCurrent((c) => c + 1)}>
            <Text style={{ fontFamily: t.typography.label, fontSize: 14, color: current === drafts.length - 1 ? t.colors.tx3 : t.colors.tx }}>NEXT ›</Text>
          </Pressable>
        </View>

        <View
          style={{
            backgroundColor: t.colors.s1,
            borderRadius: t.radius.lg,
            padding: t.spacing.lg,
            marginTop: t.spacing.md,
            opacity: draft.skipped ? 0.45 : 1,
          }}
        >
          <Heading>{draft.actual.name}</Heading>
          {draft.plannedExerciseId && draft.plannedExerciseId !== draft.actual.id ? (
            <Text style={{ fontFamily: t.typography.body, fontSize: 12, color: t.colors.blue, marginTop: 2 }}>
              swapped in
            </Text>
          ) : null}
          <Text style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.tx2, marginTop: 2, marginBottom: t.spacing.md }}>
            rest {restSecondsFor(current)} s between sets
          </Text>

          {!draft.skipped &&
            draft.sets.map((set, setIdx) => (
              <View
                key={set.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.sm,
                  marginBottom: t.spacing.sm,
                }}
              >
                <Text style={{ fontFamily: t.typography.label, width: 26, color: t.colors.tx3 }}>
                  {setIdx + 1}
                </Text>
                <Text style={{ fontFamily: t.typography.body, fontSize: 12, width: 52, color: t.colors.tx2 }}>
                  {set.plannedReps ?? '—'}
                </Text>
                <TextInput
                  value={set.reps}
                  onChangeText={(v) => updateSet(current, setIdx, { reps: v })}
                  placeholder="reps"
                  placeholderTextColor={t.colors.tx3}
                  keyboardType="number-pad"
                  style={{
                    flex: 1,
                    fontFamily: t.typography.body,
                    color: t.colors.tx,
                    backgroundColor: t.colors.s2,
                    borderRadius: t.radius.sm,
                    paddingHorizontal: t.spacing.sm,
                    paddingVertical: 6,
                  }}
                />
                <TextInput
                  value={set.weight}
                  onChangeText={(v) => updateSet(current, setIdx, { weight: v })}
                  placeholder={user.units}
                  placeholderTextColor={t.colors.tx3}
                  keyboardType="decimal-pad"
                  style={{
                    flex: 1,
                    fontFamily: t.typography.body,
                    color: t.colors.tx,
                    backgroundColor: t.colors.s2,
                    borderRadius: t.radius.sm,
                    paddingHorizontal: t.spacing.sm,
                    paddingVertical: 6,
                  }}
                />
                <Pressable
                  onPress={() => completeSet(current, setIdx)}
                  style={[
                    {
                      width: 40,
                      height: 34,
                      borderRadius: t.radius.sm,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: set.completed ? t.colors.green : t.colors.s3,
                    },
                    set.completed ? t.glow(t.colors.gGlow) : null,
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: t.typography.label,
                      color: set.completed ? t.colors.onGreen : t.colors.tx2,
                    }}
                  >
                    ✓
                  </Text>
                </Pressable>
              </View>
            ))}

          <View style={{ flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.md }}>
            <View style={{ flex: 1 }}>
              <Button label="Swap" variant="ghost" onPress={() => swapExercise(current)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={draft.skipped ? 'Unskip' : 'Skip'}
                variant="danger"
                onPress={() => skipExercise(current)}
              />
            </View>
          </View>
        </View>

        <View style={{ height: t.spacing.xl }} />
        <Button label="Finish workout" onPress={finish} busy={finishing} />
        <View style={{ height: t.spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
}
