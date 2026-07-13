import * as Crypto from 'expo-crypto';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { getDb } from '../../data/db';
import {
  listMealsLocal,
  listProfileLocal,
  MacroField,
  MACRO_FIELDS,
  MealLog,
  MealProfileItem,
  MealType,
  pushMealProfile,
  pushMeals,
  saveMealLocal,
  saveProfileItemLocal,
} from '../../data/nutritionRepo';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Body,
  Button,
  ChipRow,
  EmptyView,
  Heading,
  LoadingView,
  Screen,
  Title,
} from '../../ui';
import { useAuth } from '../auth/AuthContext';

const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export function NutritionScreen() {
  const t = useAppTheme();
  const { session } = useAuth();
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [profile, setProfile] = useState<MealProfileItem[]>([]);
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  // forms
  const [foodName, setFoodName] = useState('');
  const [foodPortion, setFoodPortion] = useState('');
  const [mealName, setMealName] = useState('');
  const [mealPortion, setMealPortion] = useState('');
  const [mealType, setMealType] = useState<MealType>('lunch');
  // macro inputs — empty string = "I don't know"
  const [macros, setMacros] = useState<Record<MacroField, string>>({
    protein: '',
    carbs: '',
    fat: '',
    calories: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    setProfile(await listProfileLocal(db));
    setMeals(await listMealsLocal(db, startOfToday()));
    setStatus('ready');
  }, []);

  const sync = useCallback(async () => {
    if (!session) return;
    const db = await getDb();
    // offline is normal — queues just stay pending
    await pushMealProfile(db, (items) => api.syncMealProfile(session.token, items)).catch(() => {});
    await pushMeals(db, (rows) => api.syncMeals(session.token, rows)).catch(() => {});
  }, [session]);

  const refreshSuggestion = useCallback(async () => {
    if (!session) return;
    try {
      const s = await api.getMealSuggestion(session.token);
      setSuggestion(s.suggestion);
    } catch {
      setSuggestion(null); // offline — suggestions need the server
    }
  }, [session]);

  useEffect(() => {
    (async () => {
      await load();
      await sync();
      await refreshSuggestion();
    })();
  }, [load, sync, refreshSuggestion]);

  async function addProfileItem() {
    if (!foodName.trim() || !foodPortion.trim()) {
      setFormError('Give the food a name and your usual portion.');
      return;
    }
    setFormError(null);
    const db = await getDb();
    await saveProfileItemLocal(db, {
      id: Crypto.randomUUID(),
      name: foodName.trim(),
      typicalPortion: foodPortion.trim(),
      deletedAt: null,
    });
    setFoodName('');
    setFoodPortion('');
    await load();
    await sync();
  }

  async function addMeal() {
    if (!mealName.trim() || !mealPortion.trim()) {
      setFormError('Give the meal a name and portion.');
      return;
    }
    setFormError(null);

    // Parse each macro: blank = unknown (null), else a non-negative number.
    const parse = (v: string): number | null => {
      const s = v.trim();
      if (!s) return null;
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const meal: MealLog = {
      id: Crypto.randomUUID(),
      name: mealName.trim(),
      portion: mealPortion.trim(),
      mealType,
      loggedAt: new Date().toISOString(),
      protein: parse(macros.protein),
      carbs: parse(macros.carbs),
      fat: parse(macros.fat),
      calories: parse(macros.calories),
      estimatedFields: [],
    };

    const db = await getDb();
    await saveMealLocal(db, meal); // save first — offline-first, honest nulls
    setMealName('');
    setMealPortion('');
    setMacros({ protein: '', carbs: '', fat: '', calories: '' });
    await load();
    await sync();

    // If online and any macro is unknown, ask the server (AI or its off-state)
    // to estimate ONLY the blanks — never blocks the log, never invents on AI-off.
    const unknown = MACRO_FIELDS.some((f) => meal[f] === null);
    if (session && unknown) {
      setEstimating(true);
      try {
        const { estimates } = await api.estimateMacros(session.token, {
          name: meal.name,
          portion: meal.portion,
          known: {
            protein: meal.protein,
            carbs: meal.carbs,
            fat: meal.fat,
            calories: meal.calories,
          },
        });
        const filled = MACRO_FIELDS.filter((f) => estimates[f] != null);
        if (filled.length > 0) {
          const enriched: MealLog = {
            ...meal,
            protein: estimates.protein ?? meal.protein,
            carbs: estimates.carbs ?? meal.carbs,
            fat: estimates.fat ?? meal.fat,
            calories: estimates.calories ?? meal.calories,
            estimatedFields: filled,
          };
          await saveMealLocal(db, enriched); // re-save + re-sync (idempotent)
          await load();
          await sync();
        }
      } catch {
        // offline / AI off / model error — the meal is already saved honestly
      } finally {
        setEstimating(false);
      }
    }

    await refreshSuggestion();
  }

  if (status === 'loading') {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }

  const input = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    keyboard: 'default' | 'numeric' = 'default',
  ) => (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={t.colors.tx3}
      keyboardType={keyboard === 'numeric' ? 'numeric' : 'default'}
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
  );

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

  const onboarding = profile.length === 0;

  return (
    <Screen>
      <Title>Nutrition</Title>
      <AccentRule />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* AI suggestion — blue = informational/AI */}
        {suggestion ? (
          <View
            style={{
              backgroundColor: t.colors.bdim,
              borderRadius: t.radius.md,
              padding: t.spacing.md,
              marginBottom: t.spacing.md,
            }}
          >
            <Text style={{ fontFamily: t.typography.body, fontSize: 14, color: t.colors.blue }}>
              {suggestion}
            </Text>
          </View>
        ) : null}

        {formError ? (
          <Text
            style={{
              fontFamily: t.typography.body,
              fontSize: 13,
              color: t.colors.red,
              marginBottom: t.spacing.sm,
            }}
          >
            {formError}
          </Text>
        ) : null}

        {onboarding &&
          card(
            'What do you usually eat?',
            <>
              <Body muted>
                Add a few foods you already eat regularly — no meal plans, no
                calorie targets. Suggestions work with your real habits.
              </Body>
              <View style={{ flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.md }}>
                {input(foodName, setFoodName, 'e.g. Porridge')}
                {input(foodPortion, setFoodPortion, 'usual portion')}
              </View>
              <View style={{ marginTop: t.spacing.md }}>
                <Button label="Add food" onPress={addProfileItem} />
              </View>
            </>,
          )}

        {card(
          "Log today's meals",
          <>
            <ChipRow options={MEAL_TYPES} value={mealType} onChange={setMealType} />
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.md }}>
              {input(mealName, setMealName, 'What did you eat?')}
              {input(mealPortion, setMealPortion, 'portion')}
            </View>
            <Text
              style={{
                fontFamily: t.typography.body,
                fontSize: 12,
                color: t.colors.tx3,
                marginTop: t.spacing.md,
              }}
            >
              Macros — leave blank for any you don't know; the coach estimates
              the rest.
            </Text>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.sm }}>
              {(['protein', 'carbs', 'fat'] as const).map((f) => (
                <View key={f} style={{ flex: 1 }}>
                  {input(
                    macros[f],
                    (v) => setMacros((m) => ({ ...m, [f]: v })),
                    `${f} g`,
                    'numeric',
                  )}
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.sm }}>
              <View style={{ flex: 1 }}>
                {input(
                  macros.calories,
                  (v) => setMacros((m) => ({ ...m, calories: v })),
                  'calories kcal',
                  'numeric',
                )}
              </View>
              <View style={{ flex: 2 }}>
                <Button
                  label={estimating ? 'Estimating…' : 'Log meal'}
                  onPress={addMeal}
                  busy={estimating}
                />
              </View>
            </View>
          </>,
        )}

        {card(
          'Today',
          meals.length === 0 ? (
            <EmptyView title="No meals yet" hint="Log your first meal above." />
          ) : (
            <View style={{ gap: t.spacing.sm }}>
              {meals.map((m) => (
                <View
                  key={m.id}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    borderBottomColor: t.colors.line,
                    borderBottomWidth: 1,
                    paddingBottom: t.spacing.sm,
                  }}
                >
                  <View style={{ flexShrink: 1 }}>
                    <Text style={{ fontFamily: t.typography.label, fontSize: 14, color: t.colors.tx }}>
                      {m.name}
                    </Text>
                    <Text style={{ fontFamily: t.typography.body, fontSize: 12, color: t.colors.tx3 }}>
                      {m.portion}
                    </Text>
                    <MacroLine meal={m} />
                  </View>
                  <Text
                    style={{
                      fontFamily: t.typography.label,
                      fontSize: 12,
                      color: t.colors.tx2,
                      textTransform: 'uppercase',
                    }}
                  >
                    {m.mealType}
                  </Text>
                </View>
              ))}
            </View>
          ),
        )}

        {!onboarding &&
          card(
            'Your usual foods',
            <View style={{ gap: t.spacing.xs }}>
              {profile.map((p) => (
                <Body key={p.id} muted>
                  {`${p.name} — ${p.typicalPortion}`}
                </Body>
              ))}
              <View style={{ flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.sm }}>
                {input(foodName, setFoodName, 'Add another food')}
                {input(foodPortion, setFoodPortion, 'portion')}
              </View>
              <View style={{ marginTop: t.spacing.sm }}>
                <Button label="Add" variant="ghost" onPress={addProfileItem} />
              </View>
            </View>,
          )}
        <View style={{ height: t.spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
}

/** Macro summary for a logged meal. AI-estimated values render in the blue
 * info accent with a "~" and are labelled "est"; user-entered values are
 * plain — so estimates are never mistaken for facts. */
function MacroLine({ meal }: { meal: MealLog }) {
  const t = useAppTheme();
  const parts: { field: MacroField; label: string }[] = [
    { field: 'protein', label: 'P' },
    { field: 'carbs', label: 'C' },
    { field: 'fat', label: 'F' },
    { field: 'calories', label: 'kcal' },
  ];
  const shown = parts.filter((p) => meal[p.field] != null);
  if (shown.length === 0) return null;
  const estimated = new Set(meal.estimatedFields);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, marginTop: 2 }}>
      {shown.map((p) => {
        const isEst = estimated.has(p.field);
        const value = meal[p.field] as number;
        const text =
          p.field === 'calories'
            ? `${isEst ? '~' : ''}${Math.round(value)} kcal`
            : `${p.label} ${isEst ? '~' : ''}${Math.round(value)}g`;
        return (
          <Text
            key={p.field}
            style={{
              fontFamily: t.typography.body,
              fontSize: 11,
              color: isEst ? t.colors.blue : t.colors.tx2,
            }}
          >
            {text}
            {isEst ? ' est' : ''}
          </Text>
        );
      })}
    </View>
  );
}
