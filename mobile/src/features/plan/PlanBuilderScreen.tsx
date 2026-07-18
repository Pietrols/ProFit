import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ApiError, NetworkError } from '../../api/client';
import { TrainingContext } from '../../api/types';
import { ExerciseCategory } from '../../data/types';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Button,
  ChipRow,
  ErrorBanner,
  Screen,
  Title,
} from '../../ui';
import { useUser } from '../auth/AuthContext';
import { HomeStackParamList } from '../home/HomeStack';
import { usePlan } from './usePlan';

const CATEGORIES: readonly (ExerciseCategory | 'custom')[] = [
  'bodybuilding',
  'powerlifting',
  'crossfit',
  'cardio',
  'custom',
];
const CONTEXTS: readonly TrainingContext[] = ['home', 'gym'];
const DAY_COUNTS = ['2', '3', '4', '5', '6', '7'] as const;

export function PlanBuilderScreen() {
  const t = useAppTheme();
  const user = useUser();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { create } = usePlan();

  const [category, setCategory] = useState<ExerciseCategory | 'custom' | null>(null);
  const [dayCount, setDayCount] = useState<string>(String(user.trainingDays));
  const [context, setContext] = useState<TrainingContext>(user.defaultContext);
  // custom mode: a category per day
  const [customDays, setCustomDays] = useState<ExerciseCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Number(dayCount);
  const isCustom = category === 'custom';
  const customReady = customDays.length === n;
  const ready = category !== null && (!isCustom || customReady);

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const days = isCustom
        ? customDays.map((c) => ({ category: c }))
        : Array.from({ length: n }, () => ({
            category: category as ExerciseCategory,
          }));
      await create({ context, days });
      nav.popToTop();
    } catch (e) {
      if (e instanceof NetworkError) {
        setError('Building a plan needs a connection. Try again when online.');
      } else if (e instanceof ApiError && e.code === 'PLAN_UNFILLABLE') {
        setError('Could not fill that mix for your context — try another combination.');
      } else {
        setError('Something went wrong creating the plan. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  const label = (text: string) => (
    <Text
      style={{
        fontFamily: t.typography.label,
        fontSize: 13,
        color: t.colors.tx2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: t.spacing.sm,
        marginTop: t.spacing.xl,
      }}
    >
      {text}
    </Text>
  );

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Title>Build your plan</Title>
        <AccentRule />
        {error ? <ErrorBanner message={error} /> : null}

        <View
          style={{
            backgroundColor: t.colors.s1,
            borderRadius: t.radius.lg,
            padding: t.spacing.md,
            marginBottom: t.spacing.lg,
          }}
        >
          <Text style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.tx2, marginBottom: t.spacing.sm }}>
            Want full control — name each day and hand-pick every exercise?
          </Text>
          <Button
            label="Build a fully custom plan"
            variant="ghost"
            onPress={() => nav.navigate('CustomPlanBuilder')}
          />
          <Button
            label="Browse starter plans"
            variant="ghost"
            onPress={() => nav.navigate('StarterTemplates')}
          />
        </View>

        {label('Or generate one — training style')}
        <ChipRow options={CATEGORIES} value={category} onChange={setCategory} />

        {label('Days per week')}
        <ChipRow
          options={DAY_COUNTS}
          value={dayCount as (typeof DAY_COUNTS)[number]}
          onChange={(d) => {
            setDayCount(d);
            setCustomDays((prev) => prev.slice(0, Number(d)));
          }}
        />

        {label('Where will you train?')}
        <ChipRow options={CONTEXTS} value={context} onChange={setContext} />

        {isCustom ? (
          <View>
            {label(`Pick a style per day (${customDays.length}/${n})`)}
            {Array.from({ length: n }, (_, i) => (
              <View key={i} style={{ marginBottom: t.spacing.md }}>
                <Text
                  style={{
                    fontFamily: t.typography.body,
                    fontSize: 13,
                    color: t.colors.tx3,
                    marginBottom: t.spacing.xs,
                  }}
                >
                  Day {i + 1}
                </Text>
                <ChipRow
                  options={['bodybuilding', 'powerlifting', 'crossfit', 'cardio'] as const}
                  value={customDays[i] ?? null}
                  onChange={(c) =>
                    setCustomDays((prev) => {
                      const next = [...prev];
                      next[i] = c;
                      return next.slice(0, n);
                    })
                  }
                />
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ height: t.spacing.xl }} />
        <Button
          label="Create plan"
          onPress={submit}
          busy={busy}
          disabled={!ready}
        />
        <View style={{ height: t.spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
}
