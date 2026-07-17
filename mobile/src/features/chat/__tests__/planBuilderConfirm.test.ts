// Piece 3: an accepted custom proposal maps 1:1 onto the existing custom-plan
// endpoint shape — the builder adds nothing of its own beyond default timers.
import { describe, expect, it } from 'vitest';
import { proposalToCustomPlanInput } from '../planBuilderConfirm';

describe('proposalToCustomPlanInput', () => {
  it('maps a custom proposal onto the /plans/custom input shape', () => {
    const input = proposalToCustomPlanInput({
      kind: 'custom',
      name: 'Compact Duo',
      context: 'home',
      days: [
        {
          name: 'Day 1',
          category: 'bodybuilding',
          exercises: [
            { exerciseId: 'pushups', sets: 3, reps: '10-15', restSeconds: 75, durationSeconds: null },
          ],
        },
      ],
    });
    expect(input).toEqual({
      name: 'Compact Duo',
      context: 'home',
      timers: { defaultRestSeconds: 90, workIntervalSeconds: null, autoAdvance: true },
      days: [
        {
          name: 'Day 1',
          category: 'bodybuilding',
          isDaily: false,
          exercises: [
            { exerciseId: 'pushups', sets: 3, reps: '10-15', restSeconds: 75, durationSeconds: null },
          ],
        },
      ],
    });
  });
});
