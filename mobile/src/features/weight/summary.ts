import type { UnitSystem } from '../profile/types';
import { formatDay } from '../../lib/dates';
import { kgToLb, unitLabel } from './units';
import type { WeightEntry } from './weightLog';

// The line under the latest weigh-in, comparing it with the one before. Worded without judging the
// direction, because losing is the goal for some people and gaining for others.
export function changeSincePrevious(entries: WeightEntry[], system: UnitSystem, today: string): string | null {
  const [latest, previous] = entries;
  if (!latest || !previous) return null;
  const diffKg = latest.weightKg - previous.weightKg;
  const diff = system === 'imperial' ? kgToLb(Math.abs(diffKg)) : Math.abs(diffKg);
  const since = formatDay(previous.date, today);
  const sinceText = since === 'Today' || since === 'Yesterday' ? since.toLowerCase() : since;
  if (diff < 0.05) return `Same as ${sinceText}`;
  return `${diffKg < 0 ? 'Down' : 'Up'} ${diff.toFixed(1)} ${unitLabel(system)} since ${sinceText}`;
}
