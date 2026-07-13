import { describe, expect, it } from 'vitest';
import { estimateDayMinutes } from '../planRepo';

describe('estimateDayMinutes', () => {
  it('sums work + rest across sets for rep-based exercises', () => {
    // 2 exercises: 3x(40+90) + 4x(40+60) = 390 + 400 = 790s ≈ 13 min
    const day = {
      exercises: [
        { sets: 3, restSeconds: 90, durationSeconds: null } as never,
        { sets: 4, restSeconds: 60, durationSeconds: null } as never,
      ],
    };
    expect(estimateDayMinutes(day)).toBe(13);
  });

  it('uses per-set duration for time-based exercises', () => {
    // 3x(45 hold + 30 rest) = 225s ≈ 4 min
    const day = { exercises: [{ sets: 3, restSeconds: 30, durationSeconds: 45 } as never] };
    expect(estimateDayMinutes(day)).toBe(4);
  });

  it('is zero for an empty day', () => {
    expect(estimateDayMinutes({ exercises: [] })).toBe(0);
  });
});
