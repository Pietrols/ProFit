import { kgToLb } from '../weight/units';
import type { Units } from './workoutForm';

export function stepperSpec(field: 'reps' | 'weight', units: Units) {
  if (field === 'reps') return { maximum: 1000, integer: true, increments: [1], initial: 1 };
  return {
    maximum: units === 'imperial' ? kgToLb(2000) : 2000,
    integer: false,
    increments: units === 'imperial' ? [1, 2.5, 5, 10] : [0.5, 1, 1.25, 2.5, 5, 10],
    initial: units === 'imperial' ? 5 : 2.5,
  };
}

// Add decimal digits as integers. Repeated taps never accumulate binary rounding errors.
export function stepDraft(
  text: string,
  direction: 'plus' | 'minus',
  increment: number,
  limits: { maximum: number; integer: boolean },
): string {
  const value = text.trim().replace(',', '.');
  const step = String(increment);
  const maximum = String(limits.maximum);
  const decimal = /^\d+(?:\.\d+)?$/;
  if (
    !decimal.test(step) ||
    increment <= 0 ||
    !Number.isFinite(limits.maximum) ||
    limits.maximum < 0 ||
    !decimal.test(maximum) ||
    (direction !== 'plus' && direction !== 'minus')
  )
    throw new Error('Choose a valid increment.');
  if (value && (value.length > 128 || !decimal.test(value)))
    throw new Error('Enter a valid number before using plus or minus.');
  if (limits.integer && (!/^\d+(?:\.0+)?$/.test(value || '0') || !Number.isInteger(increment)))
    throw new Error('Reps must be a whole number.');
  if (!value && direction === 'minus') return '';

  const places = Math.max(
    value.split('.')[1]?.length ?? 0,
    step.split('.')[1]?.length ?? 0,
    maximum.split('.')[1]?.length ?? 0,
  );
  const scale = 10n ** BigInt(places);
  const scaled = (input: string) => {
    const [whole, fraction = ''] = input.split('.');
    return BigInt(whole || '0') * scale + BigInt(fraction.padEnd(places, '0') || '0');
  };
  const next = scaled(value || '0') + (direction === 'plus' ? scaled(step) : -scaled(step));
  const bounded = next < 0n ? 0n : next;
  const fraction = (bounded % scale).toString().padStart(places, '0').replace(/0+$/, '');
  const result = `${bounded / scale}${fraction ? `.${fraction}` : ''}`;
  if (bounded > scaled(maximum)) throw new Error('This adjustment exceeds the logging limit.');
  return result;
}
