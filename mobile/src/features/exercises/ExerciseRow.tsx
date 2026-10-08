import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { ExerciseImage } from './ExerciseImage';
import { FavouriteButton } from './FavouriteButton';
import { EQUIPMENT_LABELS, musclesText } from './labels';
import type { Exercise } from './types';

export const ROW_IMAGE = 56;

type Props = { exercise: Exercise; favourite: boolean; onPress: (id: string) => void; onToggleFavourite: (id: string) => void };

// One exercise in the library list: image, name, muscles and equipment, and a star.
export const ExerciseRow = memo(function ExerciseRow({ exercise, favourite, onPress, onToggleFavourite }: Props) {
  const { colors, space } = useAppTheme();
  const details = [musclesText(exercise.primary), exercise.equipment ? EQUIPMENT_LABELS[exercise.equipment] : null].filter(Boolean).join('  ·  ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${exercise.name}. ${details}`}
        onPress={() => onPress(exercise.id)}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, opacity: pressed ? 0.7 : 1 })}>
        <ExerciseImage exercise={exercise} size={ROW_IMAGE} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong" numberOfLines={2}>{exercise.name}</AppText>
          <AppText variant="caption" color="text2" numberOfLines={1}>
            {exercise.origin === 'custom' ? 'Yours  ·  ' : ''}{details}
          </AppText>
        </View>
      </Pressable>
      <FavouriteButton on={favourite} name={exercise.name} onPress={() => onToggleFavourite(exercise.id)} />
      <View style={{ position: 'absolute', left: ROW_IMAGE + space.md, right: 0, bottom: 0, height: 1, backgroundColor: colors.line }} />
    </View>
  );
});
