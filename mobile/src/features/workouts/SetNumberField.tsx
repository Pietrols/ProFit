import { useState } from 'react';
import { View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { ChipGroup } from '@/ui/ChipGroup';
import { TextField } from '@/ui/TextField';
import { stepperSpec } from './stepDraft';
import { fieldLabel, type Units } from './workoutForm';

export function SetNumberField({
  field,
  units,
  value,
  busy,
  change,
  adjust,
}: {
  field: 'reps' | 'weight';
  units: Units;
  value: string;
  busy: boolean;
  change: (text: string) => void;
  adjust: (direction: 'plus' | 'minus', increment: number) => void;
}) {
  const { space } = useAppTheme();
  const spec = stepperSpec(field, units);
  const [increment, setIncrement] = useState(spec.initial);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unit = field === 'reps' ? 'reps' : units === 'imperial' ? 'lb' : 'kg';
  function step(direction: 'plus' | 'minus') {
    if (busy) return;
    try {
      adjust(direction, increment);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not adjust this value.');
    }
  }
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Button
          label="−"
          accessibilityLabel={`Decrease ${field} by ${increment} ${unit}`}
          variant="secondary"
          disabled={busy}
          onPress={() => step('minus')}
          style={{ paddingHorizontal: space.lg }}
        />
        <View style={{ flex: 1 }}>
          <TextField
            label={fieldLabel(field, units)}
            value={value}
            editable={!busy}
            keyboardType={field === 'reps' ? 'number-pad' : 'decimal-pad'}
            error={error}
            onChangeText={(text) => {
              setError(null);
              change(text);
            }}
          />
        </View>
        <Button
          label="+"
          accessibilityLabel={`Increase ${field} by ${increment} ${unit}`}
          variant="secondary"
          disabled={busy}
          onPress={() => step('plus')}
          style={{ paddingHorizontal: space.lg }}
        />
      </View>
      {field === 'weight' ? (
        <Button
          label={`Weight step: ${increment} ${unit}`}
          accessibilityHint="Choose the amount added or subtracted by each tap."
          accessibilityState={{ expanded: choosing, disabled: busy }}
          variant="secondary"
          disabled={busy}
          onPress={() => setChoosing(!choosing)}
        />
      ) : null}
      {choosing ? (
        <ChipGroup
          label={`Weight increment (${unit})`}
          options={spec.increments.map((value) => ({ value, label: String(value) }))}
          value={increment}
          disabled={busy}
          clearable={false}
          onChange={(value) => {
            if (value === null || busy) return;
            setIncrement(value);
            setChoosing(false);
          }}
        />
      ) : null}
    </View>
  );
}
