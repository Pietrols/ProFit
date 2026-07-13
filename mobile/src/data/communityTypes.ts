import { Exercise } from './types';

export interface UserWorkoutExercise {
  id: string;
  order: number;
  exerciseId: string;
  sets: number;
  reps: string;
  restSeconds: number;
  durationSeconds: number | null;
  exercise: Exercise;
}

export interface WorkoutCreator {
  id: string;
  displayName: string;
  // Group G surfaces these, only via a shared public workout.
  publicBio?: string | null;
  avatar?: string | null;
}

export interface UserWorkout {
  id: string;
  name: string;
  isPublic: boolean;
  coverImage: string | null;
  createdAt: string;
  exercises: UserWorkoutExercise[];
  user: WorkoutCreator;
}

export interface CreateWorkoutInput {
  name: string;
  isPublic: boolean;
  coverImage: string | null;
  exercises: {
    exerciseId: string;
    sets: number;
    reps: string;
    restSeconds: number;
    durationSeconds: number | null;
  }[];
}
