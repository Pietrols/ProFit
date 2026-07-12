import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { ExerciseCategory, Exercise } from '../../data/types';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  ChipRow,
  EmptyView,
  ErrorBanner,
  LoadingView,
  Screen,
  Title,
} from '../../ui';
import { LibraryStackParamList } from './LibraryStack';
import { useExerciseLibrary } from './useExerciseLibrary';

const CATEGORIES: readonly ExerciseCategory[] = [
  'bodybuilding',
  'powerlifting',
  'crossfit',
  'cardio',
];
const EQUIPMENT = [
  'bodyweight',
  'dumbbell',
  'barbell',
  'kettlebell',
  'machine',
  'cable',
] as const;

export function LibraryScreen() {
  const t = useAppTheme();
  const nav =
    useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ExerciseCategory | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);

  const filter = useMemo(
    () => ({
      query,
      category: category ?? undefined,
      equipment: equipment ?? undefined,
    }),
    [query, category, equipment],
  );
  const { status, exercises, refresh, refreshing } = useExerciseLibrary(filter);

  return (
    <Screen>
      <Title>Library</Title>
      <AccentRule />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search exercises…"
        placeholderTextColor={t.colors.tx3}
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
      <View style={{ marginBottom: t.spacing.sm }}>
        <ChipRow
          options={CATEGORIES}
          value={category}
          onChange={(c) => setCategory(c === category ? null : c)}
        />
      </View>
      <View style={{ marginBottom: t.spacing.md }}>
        <ChipRow
          options={EQUIPMENT}
          value={equipment as (typeof EQUIPMENT)[number] | null}
          onChange={(e) => setEquipment(e === equipment ? null : e)}
        />
      </View>

      {status === 'loading' ? (
        <LoadingView />
      ) : status === 'error' ? (
        <ErrorBanner
          message="Could not load the exercise library. Connect once to download it."
          onRetry={refresh}
        />
      ) : exercises.length === 0 ? (
        <EmptyView
          title="No exercises found"
          hint="Try a different search term or clear the filters."
        />
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(e) => e.id}
          onRefresh={refresh}
          refreshing={refreshing}
          renderItem={({ item }) => (
            <ExerciseRow
              exercise={item}
              onPress={() => nav.navigate('ExerciseDetail', { id: item.id })}
            />
          )}
        />
      )}
    </Screen>
  );
}

function ExerciseRow({
  exercise,
  onPress,
}: {
  exercise: Exercise;
  onPress: () => void;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: pressed ? t.colors.s2 : t.colors.s1,
        borderRadius: t.radius.lg,
        padding: t.spacing.md,
        marginBottom: t.spacing.sm,
        gap: t.spacing.md,
      })}
    >
      <Image
        source={{ uri: exercise.demoUrl }}
        cachePolicy="disk"
        style={{
          width: 56,
          height: 56,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.s3,
        }}
        contentFit="cover"
      />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: t.typography.label,
            fontSize: 15,
            color: t.colors.tx,
          }}
          numberOfLines={1}
        >
          {exercise.name}
        </Text>
        <Text
          style={{
            fontFamily: t.typography.body,
            fontSize: 13,
            color: t.colors.tx2,
          }}
          numberOfLines={1}
        >
          {exercise.primaryMuscles.join(', ')} · {exercise.equipment.join(', ')}
        </Text>
      </View>
    </Pressable>
  );
}
