import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';

type Props = { on: boolean; name: string; onPress: () => void };

export function FavouriteButton({ on, name, onPress }: Props) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      hitSlop={4}
      style={{ width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={on ? 'star' : 'star-outline'} size={22} color={on ? colors.accent : colors.text2} />
    </Pressable>
  );
}
