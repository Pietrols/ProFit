import { kgToLb, lbToKg } from '../weight/units';
import type { LogField } from '../plans/types';
import type { SetValues } from './types';
export type Draft = Partial<Record<LogField, string>>;
export type SetDraftEntry = { original: SetValues; draft: Draft };
export type Units = 'metric' | 'imperial';
export function fieldLabel(field: LogField, units: Units): string {
  return {
    reps: 'Reps',
    weight: `Weight (${units === 'imperial' ? 'lb' : 'kg'})`,
    time: 'Time (seconds)',
    distance: `Distance (${units === 'imperial' ? 'mi' : 'metres'})`,
    rest: 'Rest (seconds)',
    RPE: 'Effort (0 to 10)',
    notes: 'Set notes',
    done: 'Done',
  }[field];
}
export function setDraft(values: SetValues, units: Units): Draft {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (typeof value !== 'number') return [key, String(value)];
      const shown =
        units === 'imperial'
          ? key === 'weight'
            ? kgToLb(value)
            : key === 'distance'
              ? value / 1609.344
              : value
          : value;
      return [key, String(Math.round(shown * 1000) / 1000)];
    }),
  );
}
export function parseSetDraft(
  draft: Draft,
  fields: readonly LogField[],
  units: Units,
  original: SetValues,
): SetValues {
  const initial = setDraft(original, units);
  const result: SetValues = {};
  for (const field of fields) {
    const value = draft[field];
    if (value === undefined || !value.trim()) continue;
    if (field === 'notes') {
      result.notes = value;
      continue;
    }
    if (field === 'done') {
      if (value === 'true') result.done = true;
      continue;
    }
    if (!/^\d+(?:[.,]\d+)?$/.test(value.trim()))
      throw new Error(`Enter a valid ${fieldLabel(field, units).toLowerCase()}.`);
    // Unedited prefills retain their exact stored values across display-unit conversions.
    if (value === initial[field] && typeof original[field] === 'number') {
      result[field] = original[field];
      continue;
    }
    const number = Number(value.trim().replace(',', '.'));
    result[field] =
      units === 'imperial'
        ? field === 'weight'
          ? lbToKg(number)
          : field === 'distance'
            ? number * 1609.344
            : number
        : number;
  }
  return result;
}

export function timerConfig(
  mode: import('./timers').TimerConfig['mode'],
  seconds: string,
  rest: string,
  rounds: string,
): import('./timers').TimerConfig {
  const whole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : NaN);
  switch (mode) {
    case 'rest':
    case 'AMRAP':
      return { mode, seconds: whole(seconds) };
    case 'interval':
      return { mode, workSeconds: whole(seconds), restSeconds: whole(rest), rounds: whole(rounds) };
    case 'EMOM':
      return { mode, rounds: whole(rounds) };
    default:
      return { mode };
  }
}
export const setLabel = (index: number, total: number) => `Set ${index + 1} of ${total}`;
export function volumeLabel(kg: number, units: Units): string {
  return `${(units === 'imperial' ? kgToLb(kg) : kg).toFixed(1)} ${units === 'imperial' ? 'lb' : 'kg'} total`;
}
export function recordLabel(record: import('./logic').PersonalRecord, units: Units): string {
  const weight = (value: number) =>
    `${(units === 'imperial' ? kgToLb(value) : value).toFixed(1)} ${units === 'imperial' ? 'lb' : 'kg'}`;
  switch (record.metric) {
    case 'heaviestWeight':
      return `Heaviest weight, ${weight(record.value)}`;
    case 'repsAtWeight':
      return `${record.value} reps at ${weight(record.weightKg ?? 0)}`;
    case 'estimatedOneRepMax':
      return `Estimated 1RM, ${weight(record.value)}`;
    case 'longestTime':
      return `Longest time, ${record.value.toFixed(1)} seconds`;
  }
}
