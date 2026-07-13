import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { CommunityScreen } from './CommunityScreen';
import { CreateWorkoutScreen } from './CreateWorkoutScreen';
import { WorkoutDetailScreen } from './WorkoutDetailScreen';

export type CommunityStackParamList = {
  CommunityHome: undefined;
  CreateWorkout: undefined;
  WorkoutDetail: { id: string };
};

const Stack = createNativeStackNavigator<CommunityStackParamList>();

export function CommunityStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CommunityHome" component={CommunityScreen} />
      <Stack.Screen name="CreateWorkout" component={CreateWorkoutScreen} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
    </Stack.Navigator>
  );
}
