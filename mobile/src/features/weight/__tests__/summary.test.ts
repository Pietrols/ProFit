import { describe, expect, it } from 'vitest';
import { changeSincePrevious } from '../summary';
import type { WeightEntry } from '../weightLog';

const entry = (date: string, weightKg: number): WeightEntry => ({ id: date, date, weightKg, note: null, updatedAt: '' });
const TODAY = '2026-10-07';

describe('changeSincePrevious', () => {
  it('needs two entries', () => {
    expect(changeSincePrevious([], 'metric', TODAY)).toBeNull();
    expect(changeSincePrevious([entry('2026-10-07', 81)], 'metric', TODAY)).toBeNull();
  });

  it('says up or down and by how much, in the user units', () => {
    expect(changeSincePrevious([entry('2026-10-07', 81), entry('2026-10-05', 81.4)], 'metric', TODAY)).toBe('Down 0.4 kg since Mon 5 Oct');
    expect(changeSincePrevious([entry('2026-10-07', 82), entry('2026-10-06', 81)], 'imperial', TODAY)).toBe('Up 2.2 lb since yesterday');
  });

  it('calls tiny differences the same', () => {
    expect(changeSincePrevious([entry('2026-10-07', 81.02), entry('2026-10-06', 81)], 'metric', TODAY)).toBe('Same as yesterday');
  });
});
