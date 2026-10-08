import type { CustomExerciseInput } from './customExercises';
import type { Category, Equipment, Exercise, Muscle, Tracking } from './types';

// The custom exercise form's state and rules. No React: the screen holds a FormState and calls
// these to change it.

export const MAX_PRIMARY = 4;
export const MAX_SECONDARY = 6;

export type FormState = {
  name: string;
  category: Category;
  equipment: Equipment | null;
  primary: Muscle[];
  secondary: Muscle[];
  tracking: Tracking;
  // True once the user picks "what each set records" themselves; until then it follows the
  // type and equipment.
  trackingChosen: boolean;
  instructions: string;
  photoId: string | null;
};

const LOADED: ReadonlySet<Equipment> = new Set(['barbell', 'dumbbell', 'kettlebells', 'cable', 'machine', 'e-z curl bar', 'medicine ball', 'bands', 'other']);

// A sensible "what each set records" for a type and equipment, the same idea the built-in
// library uses.
export function suggestTracking(category: Category, equipment: Equipment | null): Tracking {
  if (category === 'cardio') return equipment === 'machine' ? 'distance_time' : 'time';
  if (category === 'stretching') return 'time';
  return equipment && LOADED.has(equipment) ? 'weight_reps' : 'reps';
}

export function emptyForm(name = ''): FormState {
  return {
    name,
    category: 'strength',
    equipment: null,
    primary: [],
    secondary: [],
    tracking: suggestTracking('strength', null),
    trackingChosen: false,
    instructions: '',
    photoId: null,
  };
}

// The form filled in from an existing custom exercise, for editing.
export function formFor(x: Exercise): FormState {
  return {
    name: x.name,
    category: x.category,
    equipment: x.equipment,
    primary: [...x.primary],
    secondary: [...x.secondary],
    tracking: x.tracking,
    trackingChosen: true,
    instructions: x.instructions.join('\n'),
    photoId: x.photoId,
  };
}

// Applies a change. Choosing tracking marks it as chosen; changing type or equipment updates the
// suggestion only while the user has not chosen.
export function changeForm(state: FormState, change: Partial<Omit<FormState, 'trackingChosen'>>): FormState {
  const next = { ...state, ...change };
  if (change.tracking !== undefined) next.trackingChosen = true;
  else if (!next.trackingChosen && (change.category !== undefined || change.equipment !== undefined)) {
    next.tracking = suggestTracking(next.category, next.equipment);
  }
  return next;
}

// Turns a muscle on or off in one list. A muscle sits in one list only, so picking it as a main
// muscle takes it out of the others. Returns the state unchanged when the list is full.
export function toggleMuscle(state: FormState, list: 'primary' | 'secondary', muscle: Muscle): FormState {
  const current = state[list];
  if (current.includes(muscle)) return { ...state, [list]: current.filter((m) => m !== muscle) };
  const max = list === 'primary' ? MAX_PRIMARY : MAX_SECONDARY;
  if (current.length >= max) return state;
  const other = list === 'primary' ? 'secondary' : 'primary';
  return { ...state, [list]: [...current, muscle], [other]: state[other].filter((m) => m !== muscle) };
}

export function toInput(state: FormState): CustomExerciseInput {
  return {
    name: state.name.trim(),
    category: state.category,
    equipment: state.equipment,
    primary: state.primary,
    secondary: state.secondary,
    tracking: state.tracking,
    instructions: state.instructions.trim(),
    photoId: state.photoId,
  };
}
