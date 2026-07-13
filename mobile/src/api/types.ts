export type Goal = 'bulking' | 'cutting' | 'maintaining';
export type TrainingContext = 'home' | 'gym';
export type Units = 'kg' | 'lb';

export interface User {
  id: string;
  email: string;
  displayName: string;
  goal: Goal;
  trainingDays: number;
  defaultContext: TrainingContext;
  units: Units;
  avatar?: string | null; // public profile (Group G)
  publicBio?: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ProfileUpdate {
  displayName?: string;
  goal?: Goal;
  trainingDays?: number;
  defaultContext?: TrainingContext;
  units?: Units;
  avatar?: string | null;
  publicBio?: string | null;
}
