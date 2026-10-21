import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { LoggedSetValues } from './LoggedSetValues';
import type { SetRecord } from './setChanges';
import type { SetValues } from './types';
import type { Units } from './workoutForm';

export type SetConflictState = {
  current: SetRecord;
  values: SetValues | null;
  units: Units;
};

export function SetConflict({
  conflict,
  busy,
  apply,
  keep,
}: {
  conflict: SetConflictState;
  busy: boolean;
  apply: () => void;
  keep: () => void;
}) {
  const { current, values, units } = conflict;
  const canApply = values !== null || !current.deletedAt;
  return (
    <Card>
      <AppText variant="title">This set changed</AppText>
      <AppText>Compare the saved result with your change before continuing.</AppText>
      <AppText variant="label">
        {current.deletedAt ? 'Saved result: deleted' : 'Saved result'}
      </AppText>
      <LoggedSetValues log={current} units={units} />
      <AppText variant="label">
        {values ? 'Your proposed values' : 'Your change: delete this set'}
      </AppText>
      {values ? <LoggedSetValues log={{ ...current, values }} units={units} /> : null}
      <Button label="Keep saved result" variant="secondary" disabled={busy} onPress={keep} />
      {canApply ? (
        <Button
          label={
            values
              ? current.deletedAt
                ? 'Restore set using these values'
                : 'Replace saved values'
              : 'Delete current saved result'
          }
          disabled={busy}
          onPress={apply}
        />
      ) : null}
    </Card>
  );
}
