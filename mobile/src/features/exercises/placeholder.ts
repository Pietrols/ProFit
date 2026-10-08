import { MUSCLE_LABELS, CATEGORY_LABELS } from './labels';
import type { Equipment, Exercise } from './types';

// What to show for an exercise that has no image yet: an icon for the kind of movement and a short
// label (its main muscle, or its type). Icon names are Ionicons, which ship with Expo.

export type PlaceholderIcon = 'barbell' | 'body' | 'pulse' | 'flash' | 'resize';

const BODY: ReadonlySet<Equipment> = new Set(['body only', 'exercise ball', 'foam roll']);

export function placeholderFor(x: Pick<Exercise, 'category' | 'equipment' | 'primary'>): { icon: PlaceholderIcon; label: string } {
  let icon: PlaceholderIcon;
  if (x.category === 'cardio') icon = 'pulse';
  else if (x.category === 'stretching') icon = 'resize';
  else if (x.category === 'plyometrics') icon = 'flash';
  else if (!x.equipment || BODY.has(x.equipment)) icon = 'body';
  else icon = 'barbell';
  const main = x.primary[0];
  return { icon, label: main ? MUSCLE_LABELS[main] : CATEGORY_LABELS[x.category] };
}
