import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { ChipGroup } from '@/ui/ChipGroup';
import { CATEGORY_LABELS, EQUIPMENT_LABELS, MUSCLE_LABELS } from './labels';
import type { Filters } from './search';
import { CATEGORIES, EQUIPMENT, MUSCLES } from './types';

type Props = { filters: Filters; onChange: (filters: Filters) => void };
type Panel = 'muscle' | 'equipment' | 'category';

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((value) => ({ value, label: labels[value] }));

// A row of filter buttons. Favourites toggles; the others open a set of choices underneath.
export function LibraryFilters({ filters, onChange }: Props) {
  const { space } = useAppTheme();
  const [open, setOpen] = useState<Panel | null>(null);
  const toggle = (panel: Panel) => setOpen((p) => (p === panel ? null : panel));

  return (
    <View style={{ gap: space.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        <FilterButton label="Favourites" active={!!filters.favouritesOnly} onPress={() => onChange({ ...filters, favouritesOnly: !filters.favouritesOnly })} />
        <FilterButton label={filters.muscle ? MUSCLE_LABELS[filters.muscle] : 'Muscle'} active={!!filters.muscle} expanded={open === 'muscle'} onPress={() => toggle('muscle')} />
        <FilterButton label={filters.equipment ? EQUIPMENT_LABELS[filters.equipment] : 'Equipment'} active={!!filters.equipment} expanded={open === 'equipment'} onPress={() => toggle('equipment')} />
        <FilterButton label={filters.category ? CATEGORY_LABELS[filters.category] : 'Type'} active={!!filters.category} expanded={open === 'category'} onPress={() => toggle('category')} />
      </ScrollView>
      {open === 'muscle' ? (
        <ChipGroup label="Muscle" options={options(MUSCLES, MUSCLE_LABELS)} value={filters.muscle ?? null} onChange={(muscle) => (onChange({ ...filters, muscle }), setOpen(null))} />
      ) : null}
      {open === 'equipment' ? (
        <ChipGroup label="Equipment" options={options(EQUIPMENT, EQUIPMENT_LABELS)} value={filters.equipment ?? null} onChange={(equipment) => (onChange({ ...filters, equipment }), setOpen(null))} />
      ) : null}
      {open === 'category' ? (
        <ChipGroup label="Type" options={options(CATEGORIES, CATEGORY_LABELS)} value={filters.category ?? null} onChange={(category) => (onChange({ ...filters, category }), setOpen(null))} />
      ) : null}
    </View>
  );
}

function FilterButton({ label, active, expanded, onPress }: { label: string; active: boolean; expanded?: boolean; onPress: () => void }) {
  const { colors, radius, space } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, expanded }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: touchTarget - 4,
        paddingHorizontal: space.lg,
        justifyContent: 'center',
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: active || expanded ? colors.accent : colors.line,
        backgroundColor: active ? colors.accent : pressed ? colors.surface2 : colors.surface,
      })}>
      <AppText variant="bodyStrong" style={{ color: active ? colors.onAccent : colors.text }}>{label}</AppText>
    </Pressable>
  );
}
