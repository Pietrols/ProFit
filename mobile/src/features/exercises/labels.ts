import type { Category, Equipment, Level, Muscle, Tracking } from './types';

// How library values are worded on screen.

export const CATEGORY_LABELS: Record<Category, string> = {
  strength: 'Strength',
  powerlifting: 'Powerlifting',
  'olympic weightlifting': 'Olympic lifting',
  strongman: 'Strongman',
  plyometrics: 'Plyometrics',
  cardio: 'Cardio',
  stretching: 'Stretching',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  'body only': 'Bodyweight',
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  kettlebells: 'Kettlebell',
  cable: 'Cable',
  machine: 'Machine',
  bands: 'Bands',
  'e-z curl bar': 'EZ bar',
  'medicine ball': 'Medicine ball',
  'exercise ball': 'Exercise ball',
  'foam roll': 'Foam roller',
  other: 'Other',
};

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Forearms',
  lats: 'Lats',
  'middle back': 'Middle back',
  'lower back': 'Lower back',
  traps: 'Traps',
  neck: 'Neck',
  abdominals: 'Abs',
  quadriceps: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  adductors: 'Inner thighs',
  abductors: 'Outer hips',
};

export const TRACKING_LABELS: Record<Tracking, { label: string; description: string }> = {
  weight_reps: { label: 'Weight and reps', description: 'For lifts with a barbell, dumbbells, cables or machines.' },
  reps: { label: 'Reps', description: 'For bodyweight moves. Added weight can still be logged.' },
  time: { label: 'Time', description: 'For holds and stretches, like a plank.' },
  distance_time: { label: 'Distance and time', description: 'For runs, rides and rowing.' },
};

export const LEVEL_LABELS: Record<Level, string> = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Advanced' };

// "Quads, Glutes" for a list of muscles.
export const musclesText = (muscles: Muscle[]) => muscles.map((m) => MUSCLE_LABELS[m] ?? m).join(', ');
