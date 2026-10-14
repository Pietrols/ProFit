import { describe, expect, it } from 'vitest';
import { fieldLabel, parseSetDraft, recordLabel, setDraft, setLabel, timerConfig, volumeLabel } from '../workoutForm';
import { validateTimer } from '../timers';
describe('workout form values', () => {
  it('preserves untouched unit-converted prefills exactly', () => {
    const original = { weight: 45.123456, distance: 1234.56789, reps: 8 };
    expect(parseSetDraft(setDraft(original, 'imperial'), ['weight', 'distance', 'reps'], 'imperial', original)).toEqual(original);
  });
  it('converts edited weight and distance while preserving zero and decimal commas', () => {
    const values = parseSetDraft({ weight: '100', distance: '1,5', reps: '0' }, ['weight', 'distance', 'reps'], 'imperial', {});
    expect(values.weight).toBeCloseTo(45.359237); expect(values.distance).toBeCloseTo(2414.016); expect(values.reps).toBe(0);
  });
  it('saves only selected nonblank values and explicit done', () => {
    expect(parseSetDraft({ weight: '99', reps: ' ', notes: 'Felt good', done: 'true' }, ['reps', 'notes', 'done'], 'metric', {})).toEqual({ notes: 'Felt good', done: true });
    expect(parseSetDraft({ done: 'false' }, ['done'], 'metric', {})).toEqual({});
  });
  it.each(['Infinity', 'NaN', '0x10', '-1', '1e9', '1.2.3'])('rejects malformed numeric input %s', (weight) => expect(() => parseSetDraft({ weight }, ['weight'], 'metric', {})).toThrow());
  it('builds timer configuration for all controls and rejects bad inputs', () => {
    expect(timerConfig('interval', '20', '10', '8')).toEqual({ mode: 'interval', workSeconds: 20, restSeconds: 10, rounds: 8 });
    expect(timerConfig('EMOM', '', '', '5')).toEqual({ mode: 'EMOM', rounds: 5 });
    expect(timerConfig('Tabata', '', '', '')).toEqual({ mode: 'Tabata' });
    expect(validateTimer(timerConfig('rest', '1.5', '', ''))).not.toBeNull();
  });
  it('labels values in the selected units and counts sets from one', () => {
    expect(fieldLabel('weight', 'imperial')).toBe('Weight (lb)'); expect(setLabel(0, 3)).toBe('Set 1 of 3');
    expect(volumeLabel(45.359237, 'imperial')).toBe('100.0 lb total');
    expect(recordLabel({ metric: 'heaviestWeight', value: 45.359237, previousBest: null }, 'imperial')).toBe('Heaviest weight, 100.0 lb');
  });
});
