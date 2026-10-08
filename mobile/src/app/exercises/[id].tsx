import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ExerciseImage } from '@/features/exercises/ExerciseImage';
import { FavouriteButton } from '@/features/exercises/FavouriteButton';
import { CATEGORY_LABELS, EQUIPMENT_LABELS, LEVEL_LABELS, musclesText, TRACKING_LABELS } from '@/features/exercises/labels';
import { useExerciseLibrary } from '@/features/exercises/useExerciseLibrary';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';

export default function ExerciseDetailScreen() {
  const { space } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { exercises, favourites, error, find, toggleFavourite, deleteCustom, retry } = useExerciseLibrary();
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (error) {
    return (
      <Screen>
        <EmptyState icon="warning-outline" title="Could not load this exercise" message={error} actionLabel="Try again" onAction={retry} />
      </Screen>
    );
  }
  if (!exercises) return <Screen>{null}</Screen>;

  const x = find(id);
  if (!x) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Exercise' }} />
        <EmptyState icon="help-circle-outline" title="Exercise not found" message="It may have been deleted on another phone." actionLabel="Back to the library" onAction={() => router.back()} />
      </Screen>
    );
  }

  const custom = x.origin === 'custom';
  const facts: [string, string][] = [
    ['Main muscles', musclesText(x.primary) || 'Not set'],
    ...(x.secondary.length ? [['Also works', musclesText(x.secondary)] as [string, string]] : []),
    ['Equipment', x.equipment ? EQUIPMENT_LABELS[x.equipment] : 'None'],
    ['Type', CATEGORY_LABELS[x.category]],
    ...(x.level ? [['Level', LEVEL_LABELS[x.level]] as [string, string]] : []),
    ['Each set records', TRACKING_LABELS[x.tracking].label],
  ];

  const remove = async () => {
    try {
      await deleteCustom(x.id);
      router.back();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete the exercise.');
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: custom ? 'Your exercise' : 'Exercise' }} />
      <View style={{ alignItems: 'center', paddingTop: space.md }}>
        <ExerciseImage exercise={x} size={220} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>{x.name}</AppText>
        <FavouriteButton on={favourites.has(x.id)} name={x.name} onPress={() => void toggleFavourite(x.id)} />
      </View>

      <Card>
        {facts.map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', gap: space.md }}>
            <AppText variant="label" color="text2" style={{ width: 130, paddingTop: 3 }}>{label}</AppText>
            <AppText style={{ flex: 1 }}>{value}</AppText>
          </View>
        ))}
      </Card>

      <Card>
        <AppText variant="label" color="text2">How to do it</AppText>
        {x.instructions.length ? (
          x.instructions.map((step, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
              <AppText variant="bodyStrong" color="text2" style={{ width: 22 }}>{i + 1}.</AppText>
              <AppText style={{ flex: 1 }}>{step}</AppText>
            </View>
          ))
        ) : (
          <AppText color="text2">No steps written yet.</AppText>
        )}
      </Card>

      {custom ? (
        <View style={{ gap: space.sm }}>
          <Button label="Edit" variant="secondary" onPress={() => router.push({ pathname: '/exercises/form', params: { id: x.id } })} />
          {confirming ? (
            <Card>
              <AppText>Delete {x.name}? It is removed from all your phones.</AppText>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button label="Delete" onPress={() => void remove()} />
                <Button label="Keep it" variant="secondary" onPress={() => setConfirming(false)} />
              </View>
              {deleteError ? <AppText color="caution">{deleteError}</AppText> : null}
            </Card>
          ) : (
            <Button label="Delete" variant="secondary" onPress={() => setConfirming(true)} />
          )}
        </View>
      ) : null}
    </Screen>
  );
}
