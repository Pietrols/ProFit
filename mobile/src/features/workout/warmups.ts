// Warm-up / cool-down blocks per category (PROJECT.md §1.9) — static
// templates rendered as checklists around the active workout.
import { ExerciseCategory } from '../../data/types';

export interface RoutineBlock {
  title: string;
  items: string[];
}

const GENERAL_WARMUP = ['2-3 min easy cardio (spot jog, jacks, or rower)'];
const GENERAL_COOLDOWN = ['2-3 min easy walk, let the heart rate settle'];

export const WARMUPS: Record<ExerciseCategory, RoutineBlock> = {
  bodybuilding: {
    title: 'Warm-up',
    items: [
      ...GENERAL_WARMUP,
      'Arm circles + leg swings, 10 each way',
      "1-2 light 'feeder' sets of your first exercise",
    ],
  },
  powerlifting: {
    title: 'Warm-up',
    items: [
      ...GENERAL_WARMUP,
      'Hips + ankles: deep squat hold 30 s',
      'Bar-only sets, then ramp: 40% × 5, 60% × 3, 80% × 1',
    ],
  },
  crossfit: {
    title: 'Warm-up',
    items: [
      ...GENERAL_WARMUP,
      '10 air squats, 10 push-ups, 10 good mornings',
      'Movement rehearsal: light run-through of today\'s skills',
    ],
  },
  cardio: {
    title: 'Warm-up',
    items: ['Start the first 3-5 min deliberately easy', 'Loosen calves + hip flexors'],
  },
};

export const COOLDOWNS: Record<ExerciseCategory, RoutineBlock> = {
  bodybuilding: {
    title: 'Cool-down',
    items: [...GENERAL_COOLDOWN, '30 s stretch per muscle you trained'],
  },
  powerlifting: {
    title: 'Cool-down',
    items: [...GENERAL_COOLDOWN, 'Hip flexor + hamstring stretch, 30 s each side'],
  },
  crossfit: {
    title: 'Cool-down',
    items: [...GENERAL_COOLDOWN, 'Slow nasal breathing, 10 breaths', 'Quad + shoulder stretch'],
  },
  cardio: {
    title: 'Cool-down',
    items: ['Last 3-5 min easy pace', 'Calf + quad stretch, 30 s each'],
  },
};
