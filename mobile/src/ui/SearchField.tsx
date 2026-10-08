import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, TextInput, View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';

type Props = { value: string; onChangeText: (text: string) => void; placeholder: string; label: string };

// A search box with a clear button. The label is for screen readers; the placeholder says what to type.
export function SearchField({ value, onChangeText, placeholder, label }: Props) {
  const { colors, radius, space, type } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: touchTarget, backgroundColor: colors.surface2, borderRadius: radius.pill, paddingLeft: space.lg }}>
      <Ionicons name="search" size={18} color={colors.text2} />
      <TextInput
        accessibilityLabel={label}
        accessibilityRole="search"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text2}
        selectionColor={colors.accent}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={[type.body, { flex: 1, color: colors.text, paddingHorizontal: space.sm, paddingVertical: space.sm, outlineWidth: 0 }]}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeText('')} hitSlop={8} style={{ width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close-circle" size={20} color={colors.text2} />
        </Pressable>
      ) : null}
    </View>
  );
}
