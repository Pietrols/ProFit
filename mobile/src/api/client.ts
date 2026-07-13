import { CreateWorkoutInput, UserWorkout } from '../data/communityTypes';
import { MealLog, MealProfileItem } from '../data/nutritionRepo';
import { Plan } from '../data/planRepo';
import { Exercise, ExerciseCategory } from '../data/types';
import { WorkoutSessionPayload } from '../data/workoutTypes';
import { BASE_URL } from './baseUrl';
import { AuthResponse, ProfileUpdate, User } from './types';

export { BASE_URL };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown when the request never reached the server (offline, timeout). */
export class NetworkError extends Error {
  constructor() {
    super('Could not reach the server');
    this.name = 'NetworkError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new NetworkError();
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } })
      ?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'UNKNOWN',
      err?.message ?? `Request failed (${res.status})`,
    );
  }
  return json as T;
}

export const api = {
  register: (input: { email: string; password: string; displayName: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: input }),

  login: (input: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: input }),

  getMe: (token: string) => request<{ user: User }>('/me', { token }),

  updateProfile: (token: string, input: ProfileUpdate) =>
    request<{ user: User }>('/me', { method: 'PATCH', body: input, token }),

  listExercises: (token: string, updatedSince: string | null) =>
    request<{ serverTime: string; exercises: Exercise[] }>(
      updatedSince
        ? `/exercises?updatedSince=${encodeURIComponent(updatedSince)}`
        : '/exercises',
      { token },
    ),

  createPlan: (
    token: string,
    input: {
      name?: string;
      context: 'home' | 'gym';
      days: { category: ExerciseCategory }[];
    },
  ) => request<{ plan: Plan }>('/plans', { method: 'POST', body: input, token }),

  createCustomPlan: (
    token: string,
    input: {
      name: string;
      context: 'home' | 'gym';
      timers: {
        defaultRestSeconds: number;
        workIntervalSeconds: number | null;
        autoAdvance: boolean;
      };
      days: {
        name: string;
        category: ExerciseCategory;
        isDaily: boolean;
        exercises: {
          exerciseId: string;
          sets: number;
          reps: string;
          restSeconds: number;
          durationSeconds: number | null;
        }[];
      }[];
    },
  ) =>
    request<{ plan: Plan }>('/plans/custom', {
      method: 'POST',
      body: input,
      token,
    }),

  getActivePlan: (token: string) =>
    request<{ plan: Plan | null }>('/plans/active', { token }),

  // Community workouts (Group F)
  createWorkout: (token: string, input: CreateWorkoutInput) =>
    request<{ workout: UserWorkout }>('/workout-library', {
      method: 'POST',
      body: input,
      token,
    }),

  myWorkouts: (token: string) =>
    request<{ workouts: UserWorkout[] }>('/workout-library/mine', { token }),

  publicWorkouts: (token: string) =>
    request<{ workouts: UserWorkout[] }>('/workout-library/public', { token }),

  copyWorkout: (token: string, id: string) =>
    request<{ plan: Plan }>(`/workout-library/${id}/copy`, {
      method: 'POST',
      token,
    }),

  suggestWorkoutImage: (token: string, name: string) =>
    request<{ imageUrl: string | null; available: boolean; reason: string }>(
      '/workout-library/suggest-image',
      { method: 'POST', body: { name }, token },
    ),

  syncCheckins: (
    token: string,
    checkins: { id: string; soreness: number; sleepQuality: number; loggedAt: string }[],
  ) =>
    request<{ synced: string[] }>('/recovery/sync', {
      method: 'POST',
      body: { checkins },
      token,
    }),

  sendChat: (token: string, message: string) =>
    request<{ reply: { id: string; role: 'assistant'; content: string; createdAt: string } }>(
      '/chat',
      { method: 'POST', body: { message }, token },
    ),

  getChatHistory: (token: string) =>
    request<{
      messages: { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }[];
    }>('/chat', { token }),

  syncMealProfile: (token: string, items: MealProfileItem[]) =>
    request<{ synced: string[] }>('/nutrition/profile/sync', {
      method: 'POST',
      body: { items },
      token,
    }),

  syncMeals: (token: string, meals: MealLog[]) =>
    request<{ synced: string[] }>('/nutrition/meals/sync', {
      method: 'POST',
      body: { meals },
      token,
    }),

  getMealSuggestion: (token: string) =>
    request<{ suggestion: string; targetMeal: string | null; source: 'ai' | 'fallback' }>(
      '/nutrition/suggestion',
      { token },
    ),

  estimateMacros: (
    token: string,
    input: {
      name: string;
      portion: string;
      known: {
        protein: number | null;
        carbs: number | null;
        fat: number | null;
        calories: number | null;
      };
    },
  ) =>
    request<{
      estimates: Partial<Record<'protein' | 'carbs' | 'fat' | 'calories', number>>;
      source: 'ai' | 'fallback';
    }>('/nutrition/estimate-macros', { method: 'POST', body: input, token }),

  syncBodyweight: (
    token: string,
    entries: { id: string; weightKg: number; loggedAt: string }[],
  ) =>
    request<{ synced: string[] }>('/bodyweight/sync', {
      method: 'POST',
      body: { entries },
      token,
    }),

  getNextSession: (token: string, planDayId: string) =>
    request<{
      adjustments: {
        exerciseId: string;
        sets: number;
        reps: string;
        plannedWeightKg: number | null;
        note?: string;
      }[];
      nudges: string[];
      source: 'ai' | 'fallback';
    }>(`/ai/next-session/${planDayId}`, { token }),

  syncWorkouts: (token: string, sessions: WorkoutSessionPayload[]) =>
    request<{ synced: string[] }>('/workouts/sync', {
      method: 'POST',
      body: { sessions },
      token,
    }),
};
