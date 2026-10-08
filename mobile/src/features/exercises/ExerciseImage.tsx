import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { usePhoto } from '../media/usePhoto';
import { exerciseImage } from './images';
import { placeholderFor } from './placeholder';
import type { Exercise } from './types';

type Props = { exercise: Exercise; size: number };

// A square image for an exercise: the user's photo for a custom one, ProFit's own image for a
// built-in one, otherwise a placeholder showing the kind of movement and its main muscle.
export function ExerciseImage({ exercise, size }: Props) {
  const { colors, radius } = useAppTheme();
  const photo = usePhoto(exercise.origin === 'custom' ? exercise.photoId : null);
  const bundled = exercise.origin === 'custom' ? null : exerciseImage(exercise.id);
  const frame = { width: size, height: size, borderRadius: radius.sm, backgroundColor: colors.surface2, overflow: 'hidden' as const };

  if (photo.status === 'ready') return <Image source={{ uri: photo.uri }} style={frame} accessibilityIgnoresInvertColors />;
  if (bundled !== null) return <Image source={bundled} style={frame} accessibilityIgnoresInvertColors />;

  const { icon, label } = placeholderFor(exercise);
  const large = size >= 120;
  return (
    <View style={[frame, { alignItems: 'center', justifyContent: 'center', gap: 2 }]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Ionicons name={`${icon}-outline`} size={large ? size * 0.3 : size * 0.42} color={colors.text2} />
      {large ? <AppText variant="label" color="text2">{label}</AppText> : null}
    </View>
  );
}
