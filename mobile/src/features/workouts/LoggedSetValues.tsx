import { AppText } from '@/ui/AppText';
import type { SetLog } from './types';
import { fieldLabel, setDraft, type Units } from './workoutForm';

export function LoggedSetValues({ log, units }: { log: SetLog; units: Units }) {
  const shown = setDraft(log.values, units);
  return (
    <>
      {log.logFields.map((field) => (
        <AppText key={field} color="text2">
          {fieldLabel(field, units)}:{' '}
          {field === 'done' && log.values.done !== undefined
            ? log.values.done
              ? 'Yes'
              : 'No'
            : (shown[field] ?? 'Not recorded')}
        </AppText>
      ))}
    </>
  );
}
