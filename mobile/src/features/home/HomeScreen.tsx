import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { PlanDay } from '../../data/planRepo';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Button,
  EmptyView,
  ErrorBanner,
  LoadingView,
  Screen,
  Title,
} from '../../ui';
import { useUser } from '../auth/AuthContext';
import { usePlan } from '../plan/usePlan';
import { useWorkoutSync } from '../workout/useWorkoutSync';
import { HomeStackParamList } from './HomeStack';

export function HomeScreen() {
  const t = useAppTheme();
  const user = useUser();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { status, plan, refresh } = usePlan();
  useWorkoutSync(); // drain any offline-logged sessions on app entry

  return (
    <Screen>
      <Title>Hey, {user.displayName}</Title>
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
          <Button
            label="Build my plan"
            onPress={() => nav.navigate('PlanBuilder')}
          />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text
            style={{
              fontFamily: t.typography.heading,
              fontSize: 18,
              color: t.colors.tx,
              textTransform: 'uppercase',
              marginBottom: t.spacing.md,
            }}
          >
            {plan.name} · {plan.context}
          </Text>

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
              />
            ))}
          <View style={{ height: t.spacing.md }} />
          <Button
            label="New plan"
            variant="ghost"
            onPress={() => nav.navigate('PlanBuilder')}
          />
          <View style={{ height: t.spacing.xxl }} />
        </ScrollView>
      )}
    </Screen>
  );
}

function DayCard({ day, onStart }: { day: PlanDay; onStart: () => void }) {
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
