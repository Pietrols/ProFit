import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';
import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError, NetworkError } from '../../api/client';
import { getDb } from '../../data/db';
import { searchExercises } from '../../data/exercisesRepo';
import { estimateDayMinutes, saveActivePlan } from '../../data/planRepo';
import { Exercise, ExerciseCategory } from '../../data/types';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Body,
  Button,
  ChipRow,
  ErrorBanner,
  Heading,
  KeyboardForm,
  Screen,
  Title,
} from '../../ui';
import { useAuth, useUser } from '../auth/AuthContext';
import { HomeStackParamList } from '../home/HomeStack';

const CATEGORIES: readonly ExerciseCategory[] = [
  'bodybuilding',
  'powerlifting',
  'crossfit',
  'cardio',
];

interface DraftEx {
  key: string;
  exerciseId: string;
  name: string;
  sets: string;
  reps: string;
  rest: string;
  duration: string; // blank = rep-based
}
interface DraftDay {
  key: string;
  name: string;
  category: ExerciseCategory;
  exercises: DraftEx[];
}

const newDay = (n: number): DraftDay => ({
  key: Crypto.randomUUID(),
  name: `Day ${n}`,
  category: 'bodybuilding',
  exercises: [],
});

export function CustomPlanBuilderScreen() {
  const t = useAppTheme();
  const user = useUser();
  const { session } = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const [name, setName] = useState('My Custom Plan');
  const [defaultRest, setDefaultRest] = useState('90');
  const [workInterval, setWorkInterval] = useState('');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [days, setDays] = useState<DraftDay[]>([newDay(1)]);
  const [pickerDayKey, setPickerDayKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Exercise[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchDay(key: string, patch: Partial<DraftDay>) {
    setDays((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }
  function patchEx(dayKey: string, exKey: string, patch: Partial<DraftEx>) {
    setDays((ds) =>
      ds.map((d) =>
        d.key === dayKey
          ? {
              ...d,
              exercises: d.exercises.map((e) =>
                e.key === exKey ? { ...e, ...patch } : e,
              ),
            }
          : d,
      ),
    );
  }

  async function openPicker(dayKey: string) {
    setPickerDayKey(dayKey);
    setQuery('');
    const db = await getDb();
    setResults(
      await searchExercises(db, { homeOnly: user.defaultContext === 'home' }),
    );
  }
  async function runSearch(q: string) {
    setQuery(q);
    const db = await getDb();
    setResults(
      await searchExercises(db, {
        query: q,
        homeOnly: user.defaultContext === 'home',
      }),
    );
  }
  function addExercise(dayKey: string, ex: Exercise) {
    setDays((ds) =>
      ds.map((d) =>
        d.key === dayKey
          ? {
              ...d,
              exercises: [
                ...d.exercises,
                {
                  key: Crypto.randomUUID(),
                  exerciseId: ex.id,
                  name: ex.name,
                  sets: '3',
                  reps: '8-12',
                  rest: defaultRest || '90',
                  duration: '',
                },
              ],
            }
          : d,
      ),
    );
    setPickerDayKey(null);
  }
  function removeExercise(dayKey: string, exKey: string) {
    setDays((ds) =>
      ds.map((d) =>
        d.key === dayKey
          ? { ...d, exercises: d.exercises.filter((e) => e.key !== exKey) }
          : d,
      ),
    );
  }

  async function create() {
    const emptyDay = days.find((d) => d.exercises.length === 0);
    if (emptyDay) {
      setError(`"${emptyDay.name}" has no exercises yet.`);
      return;
    }
    if (!name.trim()) {
      setError('Give your plan a name.');
      return;
    }
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const { plan } = await api.createCustomPlan(session.token, {
        name: name.trim(),
        context: user.defaultContext,
        timers: {
          defaultRestSeconds: Number(defaultRest) || 90,
          workIntervalSeconds: workInterval ? Number(workInterval) : null,
          autoAdvance,
        },
        days: days.map((d) => ({
          name: d.name.trim() || 'Day',
          category: d.category,
          exercises: d.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            sets: Number(e.sets) || 1,
            reps: e.reps.trim() || '1',
            restSeconds: Number(e.rest) || 0,
            durationSeconds: e.duration ? Number(e.duration) : null,
          })),
        })),
      });
      await saveActivePlan(await getDb(), plan);
      nav.popToTop();
    } catch (e) {
      setError(
        e instanceof NetworkError
          ? 'Building a plan needs a connection. Try again when online.'
          : e instanceof ApiError
            ? e.message
            : 'Could not create the plan. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const totalMinutes = days.reduce(
    (sum, d) =>
      sum +
      estimateDayMinutes({
        exercises: d.exercises.map((e) => ({
          sets: Number(e.sets) || 0,
          restSeconds: Number(e.rest) || 0,
          durationSeconds: e.duration ? Number(e.duration) : null,
        })) as never,
      }),
    0,
  );

  const numInput = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    width = 56,
  ) => (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={t.colors.tx3}
      keyboardType="numeric"
      style={{
        width,
        fontFamily: t.typography.body,
        fontSize: 14,
        color: t.colors.tx,
        backgroundColor: t.colors.s2,
        borderRadius: t.radius.sm,
        paddingHorizontal: t.spacing.sm,
        paddingVertical: 6,
        textAlign: 'center',
      }}
    />
  );

  return (
    <Screen>
      <KeyboardForm centered={false}>
        <Title>Custom plan</Title>
        <AccentRule />
        {error ? <ErrorBanner message={error} /> : null}

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Plan name"
          placeholderTextColor={t.colors.tx3}
          style={{
            fontFamily: t.typography.heading,
            fontSize: 20,
            color: t.colors.tx,
            backgroundColor: t.colors.s1,
            borderRadius: t.radius.md,
            paddingHorizontal: t.spacing.md,
            paddingVertical: t.spacing.sm,
            marginBottom: t.spacing.md,
          }}
        />

        {/* Timer settings */}
        <View
          style={{
            backgroundColor: t.colors.s1,
            borderRadius: t.radius.lg,
            padding: t.spacing.lg,
            marginBottom: t.spacing.md,
          }}
        >
          <Heading>Timers</Heading>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, marginTop: t.spacing.md }}>
            <Body muted>Default rest (s)</Body>
            {numInput(defaultRest, setDefaultRest, '90')}
            <Body muted>Work interval (s)</Body>
            {numInput(workInterval, setWorkInterval, 'off')}
          </View>
          <View style={{ marginTop: t.spacing.md }}>
            <ChipRow
              options={['on', 'off'] as const}
              value={autoAdvance ? 'on' : 'off'}
              onChange={(v) => setAutoAdvance(v === 'on')}
              labels={{ on: 'Auto-advance on', off: 'Auto-advance off' }}
            />
          </View>
        </View>

        {/* Days */}
        {days.map((day, di) => (
          <View
            key={day.key}
            style={{
              backgroundColor: t.colors.s1,
              borderRadius: t.radius.lg,
              padding: t.spacing.lg,
              marginBottom: t.spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              <TextInput
                value={day.name}
                onChangeText={(v) => patchDay(day.key, { name: v })}
                placeholder="Day name (e.g. Chest Day)"
                placeholderTextColor={t.colors.tx3}
                style={{
                  flex: 1,
                  fontFamily: t.typography.label,
                  fontSize: 15,
                  color: t.colors.tx,
                  backgroundColor: t.colors.s2,
                  borderRadius: t.radius.md,
                  paddingHorizontal: t.spacing.md,
                  paddingVertical: t.spacing.sm,
                }}
              />
              {days.length > 1 && (
                <Pressable
                  onPress={() => setDays((ds) => ds.filter((d) => d.key !== day.key))}
                  hitSlop={8}
                  style={{ justifyContent: 'center' }}
                >
                  <Text style={{ fontFamily: t.typography.label, color: t.colors.red }}>
                    Remove
                  </Text>
                </Pressable>
              )}
            </View>
            <View style={{ marginTop: t.spacing.sm }}>
              <ChipRow
                options={CATEGORIES}
                value={day.category}
                onChange={(c) => patchDay(day.key, { category: c })}
              />
            </View>

            {day.exercises.map((ex) => (
              <View key={ex.key} style={{ marginTop: t.spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text
                    style={{ fontFamily: t.typography.label, fontSize: 14, color: t.colors.tx, flexShrink: 1 }}
                    numberOfLines={1}
                  >
                    {ex.name}
                  </Text>
                  <Pressable onPress={() => removeExercise(day.key, ex.key)} hitSlop={8}>
                    <Text style={{ fontFamily: t.typography.body, fontSize: 12, color: t.colors.red }}>✕</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, marginTop: t.spacing.xs, flexWrap: 'wrap' }}>
                  {numInput(ex.sets, (v) => patchEx(day.key, ex.key, { sets: v }), 'sets', 44)}
                  <Text style={{ color: t.colors.tx3, fontFamily: t.typography.body, fontSize: 12 }}>× </Text>
                  <TextInput
                    value={ex.reps}
                    onChangeText={(v) => patchEx(day.key, ex.key, { reps: v })}
                    placeholder="reps"
                    placeholderTextColor={t.colors.tx3}
                    style={{
                      width: 72,
                      fontFamily: t.typography.body,
                      fontSize: 14,
                      color: t.colors.tx,
                      backgroundColor: t.colors.s2,
                      borderRadius: t.radius.sm,
                      paddingHorizontal: t.spacing.sm,
                      paddingVertical: 6,
                      textAlign: 'center',
                    }}
                  />
                  <Text style={{ color: t.colors.tx3, fontFamily: t.typography.body, fontSize: 12 }}>rest</Text>
                  {numInput(ex.rest, (v) => patchEx(day.key, ex.key, { rest: v }), 's', 48)}
                  <Text style={{ color: t.colors.tx3, fontFamily: t.typography.body, fontSize: 12 }}>hold</Text>
                  {numInput(ex.duration, (v) => patchEx(day.key, ex.key, { duration: v }), 's', 48)}
                </View>
              </View>
            ))}

            <View style={{ marginTop: t.spacing.md }}>
              <Button label="Add exercise" variant="ghost" onPress={() => openPicker(day.key)} />
            </View>
            <Text style={{ fontFamily: t.typography.body, fontSize: 12, color: t.colors.tx3, marginTop: t.spacing.sm }}>
              ~{estimateDayMinutes({
                exercises: day.exercises.map((e) => ({
                  sets: Number(e.sets) || 0,
                  restSeconds: Number(e.rest) || 0,
                  durationSeconds: e.duration ? Number(e.duration) : null,
                })) as never,
              })} min · {day.exercises.length} exercises
            </Text>
          </View>
        ))}

        <Button
          label="Add another day"
          variant="ghost"
          onPress={() => setDays((ds) => [...ds, newDay(ds.length + 1)])}
        />

        <View style={{ height: t.spacing.md }} />
        <Text style={{ fontFamily: t.typography.label, fontSize: 13, color: t.colors.tx2, textTransform: 'uppercase' }}>
          {days.length} days · ~{totalMinutes} min / week
        </Text>
        <View style={{ height: t.spacing.md }} />
        <Button label="Create plan" onPress={create} busy={busy} />
        <View style={{ height: t.spacing.xxl }} />
      </KeyboardForm>

      {/* Exercise picker */}
      <Modal visible={pickerDayKey !== null} animationType="slide">
        <Screen>
          <Title>Pick exercise</Title>
          <AccentRule />
          <TextInput
            value={query}
            onChangeText={runSearch}
            placeholder="Search exercises…"
            placeholderTextColor={t.colors.tx3}
            autoFocus
            style={{
              fontFamily: t.typography.body,
              fontSize: 16,
              color: t.colors.tx,
              backgroundColor: t.colors.s1,
              borderColor: t.colors.line2,
              borderWidth: 1,
              borderRadius: t.radius.md,
              paddingHorizontal: t.spacing.md,
              paddingVertical: t.spacing.sm,
              marginBottom: t.spacing.md,
            }}
          />
          <FlatList
            data={results}
            keyExtractor={(e) => e.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => pickerDayKey && addExercise(pickerDayKey, item)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? t.colors.s2 : t.colors.s1,
                  borderRadius: t.radius.md,
                  padding: t.spacing.md,
                  marginBottom: t.spacing.sm,
                })}
              >
                <Text style={{ fontFamily: t.typography.label, fontSize: 15, color: t.colors.tx }}>
                  {item.name}
                </Text>
                <Text style={{ fontFamily: t.typography.body, fontSize: 12, color: t.colors.tx3 }}>
                  {item.primaryMuscles.join(', ')} · {item.equipment.join(', ')}
                </Text>
              </Pressable>
            )}
          />
          <Button label="Cancel" variant="ghost" onPress={() => setPickerDayKey(null)} />
        </Screen>
      </Modal>
    </Screen>
  );
}
