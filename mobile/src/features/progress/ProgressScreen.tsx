import * as Crypto from 'expo-crypto';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { api } from '../../api/client';
import { getDb } from '../../data/db';
import {
  BodyweightEntry,
  listBodyweightLocal,
  pushBodyweight,
  saveBodyweightLocal,
} from '../../data/bodyweightRepo';
import { getExercise } from '../../data/exercisesRepo';
import { listSessionsLocal } from '../../data/workoutRepo';
import { WorkoutSessionPayload } from '../../data/workoutTypes';
import { useAppTheme } from '../../theme/ThemeContext';
import { AccentRule, Body, Button, ChipRow, EmptyView, Heading, LoadingView, Screen, Title } from '../../ui';
import { BarRow, LineChart, StatTile } from '../../ui/charts';
import { useAuth, useUser } from '../auth/AuthContext';
import { fromKg, toKg } from '../workout/computeDelta';
import {
  adherence,
  loggedExerciseIds,
  streakWeeks,
  strengthCurve,
  weeklyMuscleVolume,
} from './computeProgress';

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function ProgressScreen() {
  const t = useAppTheme();
  const user = useUser();
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const chartWidth = width - 2 * 16 - 2 * 16; // screen + card padding (spacing.lg)

  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [sessions, setSessions] = useState<WorkoutSessionPayload[]>([]);
  const [muscles, setMuscles] = useState<Map<string, string[]>>(new Map());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [curveExercise, setCurveExercise] = useState<string | null>(null);
  const [bodyweight, setBodyweight] = useState<BodyweightEntry[]>([]);
  const [bwInput, setBwInput] = useState('');
  const [bwError, setBwError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const all = (await listSessionsLocal(db)).map((r) => r.payload);
    setSessions(all);
    setBodyweight(await listBodyweightLocal(db));

    // resolve muscles + names for every exercise that appears in the logs
    const ids = new Set(all.flatMap((s) => s.exercises.map((e) => e.actualExerciseId)));
    const m = new Map<string, string[]>();
    const nm = new Map<string, string>();
    for (const id of ids) {
      const ex = await getExercise(db, id);
      if (ex) {
        m.set(id, ex.primaryMuscles);
        nm.set(id, ex.name);
      }
    }
    setMuscles(m);
    setNames(nm);
    setStatus('ready');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const curveIds = useMemo(() => loggedExerciseIds(sessions), [sessions]);
  useEffect(() => {
    if (!curveExercise && curveIds.length > 0) setCurveExercise(curveIds[0]);
  }, [curveIds, curveExercise]);

  const volume = useMemo(
    () => weeklyMuscleVolume(sessions, (id) => muscles.get(id) ?? []),
    [sessions, muscles],
  );
  const adh = useMemo(
    () => adherence(sessions, user.trainingDays),
    [sessions, user.trainingDays],
  );
  const streak = useMemo(
    () => streakWeeks(sessions, user.trainingDays),
    [sessions, user.trainingDays],
  );
  const curve = useMemo(
    () => (curveExercise ? strengthCurve(sessions, curveExercise) : []),
    [sessions, curveExercise],
  );

  async function addBodyweight() {
    const value = Number(bwInput.replace(',', '.'));
    if (!bwInput || !Number.isFinite(value) || value <= 0 || value >= 500) {
      setBwError(`Enter a weight in ${user.units}`);
      return;
    }
    setBwError(null);
    const db = await getDb();
    await saveBodyweightLocal(db, {
      id: Crypto.randomUUID(),
      weightKg: Math.round(toKg(value, user.units) * 100) / 100,
      loggedAt: new Date().toISOString(),
    });
    setBwInput('');
    setBodyweight(await listBodyweightLocal(db));
    if (session) {
      pushBodyweight(db, (entries) => api.syncBodyweight(session.token, entries)).catch(
        () => {}, // offline is normal; queue drains later
      );
    }
  }

  if (status === 'loading') {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }

  const card = (title: string, child: React.ReactNode) => (
    <View
      style={{
        backgroundColor: t.colors.s1,
        borderRadius: t.radius.lg,
        padding: t.spacing.lg,
        marginBottom: t.spacing.md,
      }}
    >
      <Heading>{title}</Heading>
      <View style={{ marginTop: t.spacing.md }}>{child}</View>
    </View>
  );

  return (
    <Screen>
      <Title>Progress</Title>
      <AccentRule />
      <ScrollView showsVerticalScrollIndicator={false}>
        {sessions.length === 0 ? (
          <EmptyView
            title="Nothing to chart yet"
            hint="Finish your first workout and your strength, volume, and adherence will show up here."
          />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: t.spacing.md, marginBottom: t.spacing.md }}>
              <StatTile
                label="Adherence · 4 wk"
                value={`${adh.pct}%`}
                accent={adh.pct >= 80 ? 'green' : adh.pct < 50 ? 'red' : undefined}
              />
              <StatTile label="Week streak" value={String(streak)} />
              <StatTile label="Sessions" value={`${adh.completed}/${adh.planned}`} />
            </View>

            {card(
              'Strength curve',
              curveIds.length === 0 ? (
                <Body muted>No weighted sets logged yet.</Body>
              ) : (
                <>
                  <ChipRow
                    options={curveIds as readonly string[]}
                    value={curveExercise}
                    onChange={setCurveExercise}
                    labels={Object.fromEntries(
                      curveIds.map((id) => [id, names.get(id) ?? id]),
                    )}
                  />
                  <View style={{ marginTop: t.spacing.md }}>
                    <LineChart
                      points={curve.map((p) => ({
                        label: shortDate(p.date),
                        value: Math.round(fromKg(p.topWeightKg, user.units) * 10) / 10,
                      }))}
                      width={chartWidth}
                      formatValue={(v) => `${v} ${user.units}`}
                    />
                  </View>
                </>
              ),
            )}

            {card(
              'This week · sets per muscle',
              volume.length === 0 ? (
                <Body muted>No completed sets this week yet.</Body>
              ) : (
                <View>
                  {volume.map((v) => (
                    <BarRow
                      key={v.muscle}
                      label={v.muscle}
                      value={v.sets}
                      max={volume[0].sets}
                      formatValue={(n) => `${n} sets`}
                    />
                  ))}
                </View>
              ),
            )}
          </>
        )}

        {card(
          'Bodyweight',
          <>
            {bodyweight.length === 0 ? (
              <Body muted>Log your first weigh-in to start the trend.</Body>
            ) : (
              <LineChart
                points={bodyweight.map((e) => ({
                  label: shortDate(e.loggedAt),
                  value: Math.round(fromKg(e.weightKg, user.units) * 10) / 10,
                }))}
                width={chartWidth}
                height={120}
                formatValue={(v) => `${v} ${user.units}`}
              />
            )}
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.md }}>
              <TextInput
                value={bwInput}
                onChangeText={setBwInput}
                placeholder={`Today's weight (${user.units})`}
                placeholderTextColor={t.colors.tx3}
                keyboardType="decimal-pad"
                style={{
                  flex: 1,
                  fontFamily: t.typography.body,
                  color: t.colors.tx,
                  backgroundColor: t.colors.s2,
                  borderRadius: t.radius.md,
                  paddingHorizontal: t.spacing.md,
                  paddingVertical: t.spacing.sm,
                }}
              />
              <View style={{ width: 100 }}>
                <Button label="Log" onPress={addBodyweight} />
              </View>
            </View>
            {bwError ? (
              <Text
                style={{
                  fontFamily: t.typography.body,
                  fontSize: 13,
                  color: t.colors.red,
                  marginTop: t.spacing.xs,
                }}
              >
                {bwError}
              </Text>
            ) : null}
          </>,
        )}
        <View style={{ height: t.spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
}
