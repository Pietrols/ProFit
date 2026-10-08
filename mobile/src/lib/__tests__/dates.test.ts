import { describe, expect, it } from 'vitest';
import { addDays, formatDay, localDay, parseDay } from '../dates';

describe('calendar days', () => {
  it('writes the local day, not the UTC one', () => {
    expect(localDay(new Date(2026, 9, 7, 23, 30))).toBe('2026-10-07');
    expect(localDay(new Date(2026, 0, 5, 0, 15))).toBe('2026-01-05');
  });

  it('round-trips through parseDay', () => {
    expect(localDay(parseDay('2026-02-28'))).toBe('2026-02-28');
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('names today and yesterday, and dates the rest', () => {
    expect(formatDay('2026-10-07', '2026-10-07')).toBe('Today');
    expect(formatDay('2026-10-06', '2026-10-07')).toBe('Yesterday');
    expect(formatDay('2026-10-05', '2026-10-07')).toBe('Mon 5 Oct');
    expect(formatDay('2025-12-30', '2026-10-07')).toBe('Tue 30 Dec 2025');
  });
});
