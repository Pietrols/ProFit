import type { Difficulty, LogField, Targets } from '../plans/types';

export type SnapshotExercise = Targets & {
  exerciseId: string; name: string; sets: number; restSeconds: number; logFields: LogField[];
};
export type WorkoutSnapshot = {
  planName: string; dayName: string; difficulty: Difficulty; restDay: boolean; exercises: SnapshotExercise[];
};
export type SessionInput = {
  planId: string; dayId: string; localDate: string; startedAt: string; endedAt: string | null;
  status: 'active' | 'completed' | 'abandoned'; notes: string; easierToday: boolean; snapshot: WorkoutSnapshot;
};
export type WorkoutSession = SessionInput & { id: string; updatedAt: string };
export type SetValues = {
  reps?: number; weight?: number; time?: number; distance?: number; rest?: number; RPE?: number;
  notes?: string; done?: boolean;
};
export type SetInput = {
  sessionId: string; exercisePosition: number; setIndex: number; loggedAt: string;
  logFields: LogField[]; values: SetValues;
};
export type SetLog = SetInput & { id: string; updatedAt: string };
