import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ExerciseDetailScreen } from './ExerciseDetailScreen';
import { LibraryScreen } from './LibraryScreen';

export type LibraryStackParamList = {
  LibraryHome: undefined;
  ExerciseDetail: { id: string };
};

const Stack = createNativeStackNavigator<LibraryStackParamList>();

export function LibraryStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LibraryHome" component={LibraryScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
    </Stack.Navigator>
  );
}
