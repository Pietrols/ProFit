import { describe, expect, it } from 'vitest';
import { formatHomeDate, greetingFor } from '../greeting';

describe('greetingFor', () => {
  it.each([
    [0, 'Late session'],
    [4, 'Late session'],
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [16, 'Good afternoon'],
    [17, 'Good evening'],
    [23, 'Good evening'],
  ])('hour %i greets with "%s"', (hour, expected) => {
    expect(greetingFor(hour)).toBe(expected);
  });
});

describe('formatHomeDate', () => {
  it('writes weekday, day and month', () => {
    expect(formatHomeDate(new Date(2026, 9, 5))).toBe('Monday, 5 October');
    expect(formatHomeDate(new Date(2027, 0, 31))).toBe('Sunday, 31 January');
  });
});
