import * as Crypto from 'expo-crypto';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { getDb } from '../../data/db';
import {
  listMealsLocal,
  listProfileLocal,
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
  const [formError, setFormError] = useState<string | null>(null);

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
    const db = await getDb();
    await saveMealLocal(db, {
      id: Crypto.randomUUID(),
      name: mealName.trim(),
      portion: mealPortion.trim(),
      mealType,
      loggedAt: new Date().toISOString(),
    });
    setMealName('');
    setMealPortion('');
    await load();
    await sync();
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
  ) => (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={t.colors.tx3}
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
            <View style={{ marginTop: t.spacing.md }}>
              <Button label="Log meal" onPress={addMeal} />
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
