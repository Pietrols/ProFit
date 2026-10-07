import type { Experience, Goal, Sex, TrainingPlace, UnitSystem } from './types';

// How profile choices are worded on screen. One list per field, in the order they are offered.

export type Option<T extends string> = { value: T; label: string; description?: string };

export const GOAL_OPTIONS: Option<Goal>[] = [
  { value: 'weight_loss', label: 'Weight loss', description: 'Lose fat and keep the muscle you have.' },
  { value: 'bodybuilding', label: 'Bodybuilding', description: 'Build muscle size and shape.' },
  { value: 'calisthenics', label: 'Calisthenics', description: 'Get strong moving your own bodyweight.' },
  { value: 'athlete', label: 'Athlete', description: 'Train speed, power and fitness for your sport.' },
  { value: 'powerlifting', label: 'Powerlifting', description: 'Lift more on the squat, bench press and deadlift.' },
  { value: 'general_fitness', label: 'General fitness', description: 'Feel fitter, stronger and healthier.' },
];

export const EXPERIENCE_OPTIONS: Option<Experience>[] = [
  { value: 'beginner', label: 'Beginner', description: 'New to training, or back after a long break.' },
  { value: 'intermediate', label: 'Intermediate', description: 'Training regularly for six months or more.' },
  { value: 'advanced', label: 'Advanced', description: 'Several years of structured training.' },
];

export const PLACE_OPTIONS: Option<TrainingPlace>[] = [
  { value: 'gym', label: 'At a gym', description: 'Machines, barbells and racks.' },
  { value: 'home', label: 'At home', description: 'Bodyweight or a little equipment.' },
  { value: 'both', label: 'Both', description: 'Some days at the gym, some at home.' },
];

export const SEX_OPTIONS: Option<Sex>[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

export const UNIT_OPTIONS: Option<UnitSystem>[] = [
  { value: 'metric', label: 'Metric', description: 'kg and cm' },
  { value: 'imperial', label: 'Imperial', description: 'lb, ft and in' },
];

export function labelFor<T extends string>(options: Option<T>[], value: T | null | undefined): string | null {
  return options.find((option) => option.value === value)?.label ?? null;
}
