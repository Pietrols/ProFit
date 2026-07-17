// Piece 3: turn an accepted builder proposal into the existing plan-creation
// calls. Pure mapping (unit-tested); the actual write happens only after the
// user's explicit confirmation tap.
import { PlanProposal } from '../../api/types';

export interface CustomPlanInput {
  name: string;
  context: 'home' | 'gym';
  timers: {
    defaultRestSeconds: number;
    workIntervalSeconds: number | null;
    autoAdvance: boolean;
  };
  days: {
    name: string;
    category: 'bodybuilding' | 'powerlifting' | 'crossfit' | 'cardio';
    isDaily: boolean;
    exercises: {
      exerciseId: string;
      sets: number;
      reps: string;
      restSeconds: number;
      durationSeconds: number | null;
    }[];
  }[];
}

export function proposalToCustomPlanInput(
  proposal: Extract<PlanProposal, { kind: 'custom' }>,
): CustomPlanInput {
  return {
    name: proposal.name,
    context: proposal.context,
    timers: { defaultRestSeconds: 90, workIntervalSeconds: null, autoAdvance: true },
    days: proposal.days.map((d) => ({
      name: d.name,
      category: d.category,
      isDaily: false,
      exercises: d.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        sets: e.sets,
        reps: e.reps,
        restSeconds: e.restSeconds,
        durationSeconds: e.durationSeconds ?? null,
      })),
    })),
  };
}
