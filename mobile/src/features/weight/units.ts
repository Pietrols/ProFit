import type { UnitSystem } from '../profile/types';

// Body weight is always stored in kg and shown in the user's units. The limits match the API's
// (backend/src/sync/collections.ts), so a value the phone accepts is never refused later.

export const WEIGHT_KG = { min: 20, max: 400 } as const;
const KG_PER_LB = 0.45359237;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

export const unitLabel = (system: UnitSystem) => (system === 'imperial' ? 'lb' : 'kg');

// One decimal place in the user's units, for example "81.4 kg" or "179.5 lb".
export function formatWeight(kg: number, system: UnitSystem): string {
  const value = system === 'imperial' ? kgToLb(kg) : kg;
  return `${value.toFixed(1)} ${unitLabel(system)}`;
}

// The value to prefill an input with, in the user's units.
export function weightInputValue(kg: number, system: UnitSystem): string {
  return (system === 'imperial' ? kgToLb(kg) : kg).toFixed(1);
}

// Reads what the user typed (a comma works as the decimal mark too) and returns kg, or a message.
export function parseWeight(text: string, system: UnitSystem): { kg: number } | { error: string } {
  const value = Number(text.trim().replace(',', '.'));
  if (!text.trim() || !Number.isFinite(value)) return { error: `Enter your weight in ${unitLabel(system)}.` };
  const kg = system === 'imperial' ? lbToKg(value) : value;
  if (kg < WEIGHT_KG.min || kg > WEIGHT_KG.max) {
    const [min, max] = system === 'imperial' ? [Math.ceil(kgToLb(WEIGHT_KG.min)), Math.floor(kgToLb(WEIGHT_KG.max))] : [WEIGHT_KG.min, WEIGHT_KG.max];
    return { error: `Enter a weight between ${min} and ${max} ${unitLabel(system)}.` };
  }
  // Two decimals in kg keeps a pound value round-tripping to the same tenth.
  return { kg: Math.round(kg * 100) / 100 };
}
