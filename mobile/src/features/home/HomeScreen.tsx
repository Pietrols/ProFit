import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api, NetworkError } from '../../api/client';
import { getDb } from '../../data/db';
import { getExercise } from '../../data/exercisesRepo';
import { listMealsLocal } from '../../data/nutritionRepo';
import { listSessionsLocal } from '../../data/workoutRepo';
import { computeWeekStreak } from '../progress/records';
import { PlanDay, PlanDifficulty, saveActivePlan } from '../../data/planRepo';
import { Exercise } from '../../data/types';
import { refreshMealReminder } from '../settings/reminders';
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
import { useAuth, useUser } from '../auth/AuthContext';
import { usePlan } from '../plan/usePlan';
import { dialBackDay } from '../workout/dialBack';
import { useWorkoutSync } from '../workout/useWorkoutSync';
import { HomeStackParamList } from './HomeStack';

const DIFFICULTIES: readonly PlanDifficulty[] = ['gentle', 'standard', 'challenging'];

export function HomeScreen() {
  const t = useAppTheme();
  const user = useUser();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { session } = useAuth();
  const { status, plan, refresh } = usePlan();
  useWorkoutSync(); // drain any offline-logged sessions on app entry
  // Plan controls live behind an expander so the day cards stay the hero
  // content (AUDIT U1).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diffBusy, setDiffBusy] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  // What the last difficulty change actually did, with a one-tap undo (U2).
  const [diffNote, setDiffNote] = useState<{
    text: string;
    prev: PlanDifficulty;
  } | null>(null);
  // Week streak (AUDIT M2) — computed from local sessions, works offline.
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    (async () => {
      const rows = await listSessionsLocal(await getDb());
      setStreak(computeWeekStreak(rows.map((r) => r.payload)));
    })();
  }, []);

  // Per-plan difficulty baseline (Piece 4a): persisted server-side, ladder
  // swaps + rest adjustments come back in the updated plan.
  async function setDifficulty(difficulty: PlanDifficulty) {
    if (!session || !plan || diffBusy) return;
    const prev = plan.difficulty ?? 'standard';
    if (difficulty === prev) return;
    setDiffBusy(true);
    setDiffError(null);
    setDiffNote(null);
    try {
      const { plan: updated } = await api.setPlanDifficulty(session.token, difficulty);
      await saveActivePlan(await getDb(), updated);
      // U2: name what changed instead of silently swapping exercises
      const before = new Map(
        plan.days.flatMap((d) => d.exercises.map((e) => [e.id, e.exercise.name])),
      );
      const swaps = updated.days
        .flatMap((d) => d.exercises)
        .filter((e) => before.get(e.id) && before.get(e.id) !== e.exercise.name)
        .map((e) => `${before.get(e.id)} → ${e.exercise.name}`);
      const summary =
        swaps.length === 0
          ? 'rest times adjusted'
          : swaps.slice(0, 2).join(', ') +
            (swaps.length > 2 ? ` (+${swaps.length - 2} more)` : '');
      setDiffNote({ text: `Set to ${difficulty} — ${summary}.`, prev });
      await refresh();
    } catch (e) {
      setDiffError(
        e instanceof NetworkError
          ? 'Offline — difficulty needs a connection to change.'
          : 'Could not change the difficulty. Please try again.',
      );
    } finally {
      setDiffBusy(false);
    }
  }

  // Per-session dial-back (Piece 4b): transforms today's day only; the saved
  // plan (server and local cache) is untouched.
  async function startEasier(day: PlanDay, planId: string) {
    const db = await getDb();
    const map = new Map<string, Exercise | null>();
    for (const pe of day.exercises) {
      if (!map.has(pe.exerciseId)) map.set(pe.exerciseId, await getExercise(db, pe.exerciseId));
    }
    for (const ex of [...map.values()]) {
      if (ex?.easierVariantId && !map.has(ex.easierVariantId)) {
        map.set(ex.easierVariantId, await getExercise(db, ex.easierVariantId));
      }
    }
    const easier = dialBackDay(day, (id) => map.get(id) ?? null);
    nav.navigate('ActiveWorkout', { day: easier, planId });
  }

  // Re-arm the meal reminder on app open: pushed to tomorrow if today's meals
  // are already logged, so it never fires on an already-logged day (Group H).
  useEffect(() => {
    (async () => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const todays = await listMealsLocal(await getDb(), dayStart.toISOString());
      refreshMealReminder(todays.length > 0).catch(() => {});
    })();
  }, []);

  return (
    <Screen>
      <Title>Hey, {user.displayName}</Title>
      {streak > 0 ? (
        <Text
          style={{
            fontFamily: t.typography.label,
            fontSize: 13,
            color: t.colors.green,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginTop: t.spacing.xs,
          }}
        >
          🔥 {streak}-week streak
        </Text>
      ) : null}
      <AccentRule />

      {status === 'loading' ? (
        <LoadingView />
      ) : status === 'error' ? (
        <ErrorBanner message="Could not load your plan." onRetry={refresh} />
      ) : !plan ? (
        <View style={{ flex: 1 }}>
          <EmptyView
            title="No plan yet"
            hint="Build a weekly plan from your goal, schedule, and equipment."
          />
          <View style={{ gap: t.spacing.sm }}>
            <Button
              label="Build my plan"
              onPress={() => nav.navigate('PlanBuilder')}
            />
            <Button
              label="Browse starter plans"
              variant="ghost"
              onPress={() => nav.navigate('StarterTemplates')}
            />
          </View>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Plan header doubles as the settings expander (AUDIT U1) */}
          <Pressable
            onPress={() => setSettingsOpen((o) => !o)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: t.spacing.md,
            }}
          >
            <Text
              style={{
                fontFamily: t.typography.heading,
                fontSize: 18,
                color: t.colors.tx,
                textTransform: 'uppercase',
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {plan.name} · {plan.context}
            </Text>
            <Text
              style={{
                fontFamily: t.typography.label,
                fontSize: 12,
                color: t.colors.green,
                textTransform: 'uppercase',
              }}
            >
              {(plan.difficulty ?? 'standard') + (settingsOpen ? ' ▴' : ' ▾')}
            </Text>
          </Pressable>

          {settingsOpen ? (
            <View
              style={{
                backgroundColor: t.colors.s1,
                borderRadius: t.radius.lg,
                padding: t.spacing.lg,
                marginBottom: t.spacing.md,
                opacity: diffBusy ? 0.6 : 1,
                gap: t.spacing.sm,
              }}
            >
              <Text
                style={{
                  fontFamily: t.typography.label,
                  fontSize: 12,
                  color: t.colors.tx3,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Difficulty
              </Text>
              <ChipRow
                options={DIFFICULTIES}
                value={plan.difficulty ?? 'standard'}
                onChange={setDifficulty}
              />
              {diffError ? <ErrorBanner message={diffError} /> : null}
              <Button
                label="New plan"
                variant="ghost"
                onPress={() => nav.navigate('PlanBuilder')}
              />
              <Button
                label="Browse starter plans"
                variant="ghost"
                onPress={() => nav.navigate('StarterTemplates')}
              />
            </View>
          ) : null}

          {diffNote ? (
            <View
              style={{
                backgroundColor: t.colors.gdim,
                borderRadius: t.radius.md,
                padding: t.spacing.md,
                marginBottom: t.spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
              }}
            >
              <Text
                style={{
                  fontFamily: t.typography.body,
                  fontSize: 13,
                  color: t.colors.green,
                  flex: 1,
                }}
              >
                {diffNote.text}
              </Text>
              <Pressable onPress={() => setDifficulty(diffNote.prev)} hitSlop={8}>
                <Text style={{ fontFamily: t.typography.label, fontSize: 13, color: t.colors.green }}>
                  UNDO
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Mandatory daily routine — shown every day, above the split, with
              its own completion (a separate workout session). */}
          {plan.days.some((d) => d.isDaily) && (
            <View style={{ marginBottom: t.spacing.md }}>
              <Text
                style={{
                  fontFamily: t.typography.label,
                  fontSize: 12,
                  color: t.colors.green,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: t.spacing.sm,
                }}
              >
                Every day
              </Text>
              {plan.days
                .filter((d) => d.isDaily)
                .map((day) => (
                  <DayCard
                    key={day.id}
                    day={day}
                    onStart={() => nav.navigate('ActiveWorkout', { day, planId: plan.id })}
                    onStartEasier={() => startEasier(day, plan.id)}
                  />
                ))}
            </View>
          )}

          {plan.days.some((d) => !d.isDaily) && (
            <Text
              style={{
                fontFamily: t.typography.label,
                fontSize: 12,
                color: t.colors.tx3,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: t.spacing.sm,
              }}
            >
              Weekly split
            </Text>
          )}
          {plan.days
            .filter((d) => !d.isDaily)
            .map((day) => (
              <DayCard
                key={day.id}
                day={day}
                onStart={() => nav.navigate('ActiveWorkout', { day, planId: plan.id })}
                onStartEasier={() => startEasier(day, plan.id)}
              />
            ))}
          <View style={{ height: t.spacing.xxl }} />
        </ScrollView>
      )}
    </Screen>
  );
}

function DayCard({
  day,
  onStart,
  onStartEasier,
}: {
  day: PlanDay;
  onStart: () => void;
  onStartEasier: () => void;
}) {
  const t = useAppTheme();
  const [open, setOpen] = React.useState(day.dayIndex === 0);
  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      style={{
        backgroundColor: t.colors.s1,
        borderRadius: t.radius.lg,
        padding: t.spacing.lg,
        marginBottom: t.spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: t.typography.heading,
            fontSize: 17,
            color: t.colors.tx,
            textTransform: 'uppercase',
          }}
        >
          {day.isDaily ? day.name : `Day ${day.dayIndex + 1} — ${day.name}`}
        </Text>
        <Text
          style={{
            fontFamily: t.typography.label,
            fontSize: 12,
            color: t.colors.tx3,
            textTransform: 'uppercase',
          }}
        >
          {day.category}
        </Text>
      </View>
      {open ? (
        <View style={{ marginTop: t.spacing.md, gap: t.spacing.sm }}>
          {day.exercises.map((pe) => (
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
              <Text
                style={{
                  fontFamily: t.typography.body,
                  fontSize: 14,
                  color: t.colors.tx,
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                {pe.exercise.name}
              </Text>
              <Text
                style={{
                  fontFamily: t.typography.label,
                  fontSize: 14,
                  color: t.colors.tx2,
                }}
              >
                {pe.sets} × {pe.reps}
              </Text>
            </View>
          ))}
          <Button label="Start workout" onPress={onStart} />
          {/* Per-session dial-back: today only, saved plan untouched */}
          <Button
            label="Not feeling it — start easier"
            variant="ghost"
            onPress={onStartEasier}
          />
        </View>
      ) : (
        <Text
          style={{
            fontFamily: t.typography.body,
            fontSize: 13,
            color: t.colors.tx3,
            marginTop: t.spacing.xs,
          }}
        >
          {day.exercises.length} exercises — tap to expand
        </Text>
      )}
    </Pressable>
  );
}
