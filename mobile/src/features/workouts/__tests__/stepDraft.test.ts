import { describe, expect, it } from 'vitest';
import { stepDraft, stepperSpec } from '../stepDraft';
import { parseSetDraft } from '../workoutForm';
import { validateLoggedValues } from '../model';

describe('display-unit steppers', () => {
  const metric = stepperSpec('weight', 'metric');
  it('handles blank, zero, comma decimals and arbitrary typed weights', () => {
    expect(stepDraft('', 'plus', 2.5, metric)).toBe('2.5');
    expect(stepDraft(' ', 'minus', 2.5, metric)).toBe('');
    expect(stepDraft('0', 'minus', 2.5, metric)).toBe('0');
    expect(stepDraft('1', 'minus', 2.5, metric)).toBe('0');
    expect(stepDraft(' 61,35 ', 'plus', 2.5, metric)).toBe('63.85');
    expect(stepDraft('63.85', 'minus', 1.25, metric)).toBe('62.6');
  });
  it('does not drift after repeated fine increments', () => {
    let value = '0.123456789';
    for (let i = 0; i < 100; i++) value = stepDraft(value, 'plus', 0.1, metric);
    expect(value).toBe('10.123456789');
    for (let i = 0; i < 100; i++) value = stepDraft(value, 'minus', 0.1, metric);
    expect(value).toBe('0.123456789');
  });
  it.each(['NaN', '-1', '1e2', '1.2.3', '1,2,3', 'Infinity', '0x10'])('rejects %s', (value) => {
    expect(() => stepDraft(value, 'plus', 2.5, metric)).toThrow('valid number');
  });
  it('enforces canonical weight and whole repetition limits', () => {
    expect(stepDraft('1997.5', 'plus', 2.5, metric)).toBe('2000');
    expect(() => stepDraft('2000', 'plus', 0.5, metric)).toThrow('limit');
    expect(() => stepDraft('1999.5000000000000001', 'plus', 0.5, metric)).toThrow('limit');
    const reps = stepperSpec('reps', 'imperial');
    expect(stepDraft('999', 'plus', 1, reps)).toBe('1000');
    expect(() => stepDraft('1000', 'plus', 1, reps)).toThrow('limit');
    expect(() => stepDraft('8.5', 'minus', 1, reps)).toThrow('whole');
    expect(() => stepDraft('8.0000000000000001', 'minus', 1, reps)).toThrow('whole');
  });
  it('steps in pounds before converting once at save', () => {
    const imperial = stepperSpec('weight', 'imperial');
    expect(imperial.initial).toBe(5);
    const weight = stepDraft('100', 'plus', imperial.initial, imperial);
    expect(weight).toBe('105');
    const values = parseSetDraft({ weight }, ['weight'], 'imperial', {});
    expect(values.weight).toBeCloseTo(47.62719885);
    expect(validateLoggedValues(['weight'], values)).toBeNull();
    expect(() => stepDraft('4409', 'plus', 5, imperial)).toThrow('limit');
  });
});
