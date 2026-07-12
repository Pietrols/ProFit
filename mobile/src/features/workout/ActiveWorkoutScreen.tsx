import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { findSubstitutes } from '../../data/exercisesRepo';
import { hasCheckinToday, pushCheckins, saveCheckinLocal } from '../../data/recoveryRepo';
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
import { Button, ChipRow, Heading, Screen } from '../../ui';
import { COOLDOWNS, WARMUPS } from './warmups';
import { useAuth, useUser } from '../auth/AuthContext';
import { HomeStackParamList } from '../home/HomeStack';
import { computeDelta, fromKg, toKg } from './computeDelta';
import { useWorkoutSync } from './useWorkoutSync';

interface SetDraft {
  id: string;
  plannedReps: string | null;
  plannedWeightKg: number | null; // AI-prescribed load, if any
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
  const { session } = useAuth();
  const route = useRoute<RouteProp<HomeStackParamList, 'ActiveWorkout'>>();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { push } = useWorkoutSync();
  const { day, planId } = route.params;

  const startedAt = useRef(new Date()).current;
  const sessionId = useRef(Crypto.randomUUID()).current;
  const [elapsed, setElapsed] = useState(0);
  const [rest, setRest] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<ExerciseDraft[] | null>(null);
  const [nudges, setNudges] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [soreness, setSoreness] = useState<string | null>(null);
  const [sleep, setSleep] = useState<string | null>(null);
  const [swapOptions, setSwapOptions] = useState<Exercise[] | null>(null);

  // Build drafts from the plan day, resolving exercises from device SQLite.
  // When online, the AI (or its deterministic fallback) adjusts sets/reps and
  // prescribes loads; offline, the plan is used as-is — never blocked on AI.
  useEffect(() => {
    (async () => {
      const adjustment = session
        ? await api.getNextSession(session.token, day.id).catch(() => null)
        : null;
      const adjustFor = new Map(
        (adjustment?.adjustments ?? []).map((a) => [a.exerciseId, a]),
      );
      setNudges(adjustment?.nudges ?? []);

      const db = await getDb();
      const built: ExerciseDraft[] = [];
      for (const pe of day.exercises) {
        const ex = (await getExercise(db, pe.exerciseId)) ?? pe.exercise;
        const adj = adjustFor.get(pe.exerciseId);
        const setCount = adj?.sets ?? pe.sets;
        const reps = adj?.reps ?? pe.reps;
        const weightKg = adj?.plannedWeightKg ?? null;
        built.push({
          id: Crypto.randomUUID(),
          plannedExerciseId: pe.exerciseId,
          actual: ex,
          skipped: false,
          sets: Array.from({ length: setCount }, () => ({
            id: Crypto.randomUUID(),
            plannedReps: reps,
            plannedWeightKg: weightKg,
            reps: '',
            weight:
              weightKg !== null
                ? String(Math.round(fromKg(weightKg, user.units) * 10) / 10)
                : '',
            completed: false,
          })),
        });
      }
      setDrafts(built);
    })();
  }, [day, session, user.units]);

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

  // Substitution engine: same-muscle, context-appropriate candidates.
  async function openSwap(exIdx: number) {
    const db = await getDb();
    const options = await findSubstitutes(
      db,
      drafts![exIdx].actual,
      user.defaultContext,
    );
    setSwapOptions(options);
  }

  function applySwap(alt: Exercise) {
    setDrafts((prev) =>
      prev!.map((e, i) =>
        i === current ? { ...e, actual: alt, swapReason: 'equipment' as const } : e,
      ),
    );
    setSwapOptions(null);
  }

  async function submitCheckin(skip: boolean) {
    setCheckinOpen(false);
    if (skip || soreness === null || sleep === null) return;
    const db = await getDb();
    await saveCheckinLocal(db, {
      id: Crypto.randomUUID(),
      soreness: Number(soreness),
      sleepQuality: Number(sleep),
      loggedAt: new Date().toISOString(),
    });
    if (session) {
      pushCheckins(db, (rows) => api.syncCheckins(session.token, rows)).catch(() => {});
    }
  }

  // One recovery check-in per day, asked as the session starts.
  useEffect(() => {
    (async () => {
      const db = await getDb();
      if (!(await hasCheckinToday(db))) setCheckinOpen(true);
    })();
  }, []);

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
              plannedWeightKg: s.plannedWeightKg,
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

      {/* AI coach nudges — blue = informational/AI per the design system */}
      {nudges.length > 0 && (
        <View
          style={{
            backgroundColor: t.colors.bdim,
            borderRadius: t.radius.md,
            padding: t.spacing.md,
            marginTop: t.spacing.md,
            gap: 4,
          }}
        >
          {nudges.map((n, i) => (
            <Text
              key={i}
              style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.blue }}
            >
              {n}
            </Text>
          ))}
        </View>
      )}

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
        <ChecklistBlock block={WARMUPS[day.category]} defaultOpen={current === 0} />

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
              <Button label="Swap" variant="ghost" onPress={() => openSwap(current)} />
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

        <View style={{ height: t.spacing.lg }} />
        <ChecklistBlock
          block={COOLDOWNS[day.category]}
          defaultOpen={current === drafts.length - 1}
        />
        <View style={{ height: t.spacing.lg }} />
        <Button label="Finish workout" onPress={finish} busy={finishing} />
        <View style={{ height: t.spacing.xxl }} />
      </ScrollView>

      {/* Recovery check-in — one per day, feeds deload logic */}
      <Modal visible={checkinOpen} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            padding: t.spacing.xl,
          }}
        >
          <View
            style={{
              backgroundColor: t.colors.s1,
              borderRadius: t.radius.xl,
              padding: t.spacing.lg,
              gap: t.spacing.md,
            }}
          >
            <Heading>Quick check-in</Heading>
            <Text style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.tx2 }}>
              How sore are you? (1 fresh — 5 wrecked)
            </Text>
            <ChipRow options={['1', '2', '3', '4', '5'] as const} value={soreness as '1' | null} onChange={setSoreness} />
            <Text style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.tx2 }}>
              How did you sleep? (1 awful — 5 great)
            </Text>
            <ChipRow options={['1', '2', '3', '4', '5'] as const} value={sleep as '1' | null} onChange={setSleep} />
            <Button
              label="Save"
              onPress={() => submitCheckin(false)}
              disabled={soreness === null || sleep === null}
            />
            <Button label="Skip" variant="ghost" onPress={() => submitCheckin(true)} />
          </View>
        </View>
      </Modal>

      {/* Substitution picker */}
      <Modal visible={swapOptions !== null} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            padding: t.spacing.xl,
          }}
        >
          <View
            style={{
              backgroundColor: t.colors.s1,
              borderRadius: t.radius.xl,
              padding: t.spacing.lg,
              gap: t.spacing.sm,
            }}
          >
            <Heading>Swap exercise</Heading>
            {swapOptions?.length === 0 ? (
              <Text style={{ fontFamily: t.typography.body, color: t.colors.tx2 }}>
                No matching alternative for your equipment — skip it instead.
              </Text>
            ) : (
              swapOptions?.map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() => applySwap(opt)}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? t.colors.s3 : t.colors.s2,
                    borderRadius: t.radius.md,
                    padding: t.spacing.md,
                  })}
                >
                  <Text style={{ fontFamily: t.typography.label, fontSize: 14, color: t.colors.tx }}>
                    {opt.name}
                  </Text>
                  <Text style={{ fontFamily: t.typography.body, fontSize: 12, color: t.colors.tx3 }}>
                    {opt.primaryMuscles.join(', ')} · {opt.equipment.join(', ')}
                  </Text>
                </Pressable>
              ))
            )}
            <Button label="Cancel" variant="ghost" onPress={() => setSwapOptions(null)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function ChecklistBlock({
  block,
  defaultOpen,
}: {
  block: { title: string; items: string[] };
  defaultOpen: boolean;
}) {
  const t = useAppTheme();
  const [open, setOpen] = useState(defaultOpen);
  const [done, setDone] = useState<Set<number>>(new Set());
  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      style={{
        backgroundColor: t.colors.s1,
        borderRadius: t.radius.lg,
        padding: t.spacing.md,
      }}
    >
      <Text
        style={{
          fontFamily: t.typography.heading,
          fontSize: 15,
          color: t.colors.tx2,
          textTransform: 'uppercase',
        }}
      >
        {block.title} {open ? '' : `· ${block.items.length} items`}
      </Text>
      {open &&
        block.items.map((item, i) => (
          <Pressable
            key={i}
            onPress={() =>
              setDone((prev) => {
                const next = new Set(prev);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                return next;
              })
            }
            style={{ flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.sm }}
          >
            <Text style={{ fontFamily: t.typography.label, color: done.has(i) ? t.colors.green : t.colors.tx3 }}>
              {done.has(i) ? '✓' : '○'}
            </Text>
            <Text
              style={{
                fontFamily: t.typography.body,
                fontSize: 13,
                color: done.has(i) ? t.colors.tx3 : t.colors.tx2,
                textDecorationLine: done.has(i) ? 'line-through' : 'none',
                flexShrink: 1,
              }}
            >
              {item}
            </Text>
          </Pressable>
        ))}
    </Pressable>
  );
}
