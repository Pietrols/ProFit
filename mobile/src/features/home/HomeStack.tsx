import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { PlanBuilderScreen } from '../plan/PlanBuilderScreen';
import { HomeScreen } from './HomeScreen';

export type HomeStackParamList = {
  HomeMain: undefined;
  PlanBuilder: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="PlanBuilder" component={PlanBuilderScreen} />
    </Stack.Navigator>
  );
}
