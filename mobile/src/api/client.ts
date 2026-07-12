import { Plan } from '../data/planRepo';
import { Exercise, ExerciseCategory } from '../data/types';
import { WorkoutSessionPayload } from '../data/workoutTypes';
import { AuthResponse, ProfileUpdate, User } from './types';

// Android emulator reaches the host machine at 10.0.2.2; a physical device
// needs the dev machine's LAN IP via EXPO_PUBLIC_API_URL (see .env.example).
export const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';

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

  getActivePlan: (token: string) =>
    request<{ plan: Plan | null }>('/plans/active', { token }),

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
