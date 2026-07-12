import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { PlanDay } from '../../data/planRepo';
import { PlanBuilderScreen } from '../plan/PlanBuilderScreen';
import { ActiveWorkoutScreen } from '../workout/ActiveWorkoutScreen';
import { WorkoutSummaryScreen } from '../workout/WorkoutSummaryScreen';
import { HomeScreen } from './HomeScreen';

export type HomeStackParamList = {
  HomeMain: undefined;
  PlanBuilder: undefined;
  ActiveWorkout: { day: PlanDay; planId: string | null };
  WorkoutSummary: { sessionId: string; synced: boolean };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="PlanBuilder" component={PlanBuilderScreen} />
      <Stack.Screen
        name="ActiveWorkout"
        component={ActiveWorkoutScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} />
    </Stack.Navigator>
  );
}
