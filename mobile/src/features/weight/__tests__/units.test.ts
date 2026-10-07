import { describe, expect, it } from 'vitest';
import { formatWeight, kgToLb, parseWeight, weightInputValue } from '../units';

describe('weight units', () => {
  it('shows kg or lb with one decimal', () => {
    expect(formatWeight(81.4, 'metric')).toBe('81.4 kg');
    expect(formatWeight(81.4, 'imperial')).toBe('179.5 lb');
    expect(weightInputValue(81.4, 'imperial')).toBe('179.5');
  });

  it('reads typed values into kg, accepting a decimal comma', () => {
    expect(parseWeight('81.4', 'metric')).toEqual({ kg: 81.4 });
    expect(parseWeight('81,4', 'metric')).toEqual({ kg: 81.4 });
    expect(parseWeight('179.5', 'imperial')).toEqual({ kg: 81.42 });
  });

  it('round-trips a pound value to the same tenth', () => {
    const parsed = parseWeight('179.5', 'imperial');
    expect('kg' in parsed && kgToLb(parsed.kg).toFixed(1)).toBe('179.5');
  });

  it('refuses empty, non-numeric and out-of-range values in the user units', () => {
    expect(parseWeight('', 'metric')).toEqual({ error: 'Enter your weight in kg.' });
    expect(parseWeight('abc', 'imperial')).toEqual({ error: 'Enter your weight in lb.' });
    expect(parseWeight('15', 'metric')).toEqual({ error: 'Enter a weight between 20 and 400 kg.' });
    expect(parseWeight('900', 'imperial')).toEqual({ error: 'Enter a weight between 45 and 881 lb.' });
  });
});
