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
  // Set when first-run onboarding was completed or skipped (Piece 2).
  onboardedAt?: string | null;
  // Set once the email is confirmed (AUDIT S3).
  emailVerifiedAt?: string | null;
}

// Starter template as resolved by GET /plans/templates (Piece 1/2).
export interface StarterTemplate {
  id: string;
  title: string;
  description: string;
  disclaimer: string;
  goal: 'general' | 'fat_loss' | 'chest_arms_shoulders' | 'glutes_legs';
  gentle: boolean;
  contexts: TrainingContext[];
  context: TrainingContext; // the context this resolution used
  days: {
    name: string;
    category: string;
    exercises: {
      exerciseId: string;
      sets: number;
      reps: string;
      restSeconds: number;
      durationSeconds: number | null;
      note: string | null;
      exercise: {
        id: string;
        name: string;
        equipment: string[];
        movementPattern: string | null;
        difficultyTier: number | null;
      };
    }[];
  }[];
}

// Conversational plan builder (Piece 3).
export interface BuilderMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type PlanProposal =
  | {
      kind: 'template';
      templateId: string;
      context: TrainingContext;
      experience: 'beginner' | 'intermediate' | 'advanced';
    }
  | {
      kind: 'custom';
      name: string;
      context: TrainingContext;
      days: {
        name: string;
        category: 'bodybuilding' | 'powerlifting' | 'crossfit' | 'cardio';
        exercises: {
          exerciseId: string;
          sets: number;
          reps: string;
          restSeconds: number;
          durationSeconds: number | null;
        }[];
      }[];
    };

export type PlanBuilderReply =
  | { action: 'ask'; question: string }
  | { action: 'propose'; summary: string; proposal: PlanProposal };

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
  onboarded?: boolean;
  injuryNotes?: string | null;
}
