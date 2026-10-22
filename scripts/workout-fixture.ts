import { fakeSyncServer } from '../mobile/src/features/sync/__tests__/fakeSyncServer';
import type { WorkoutSnapshot } from '../mobile/src/features/workouts/types';

export const fixtureUser = {
  id: '00000000-0000-4000-8000-000000000041',
  email: 'workout@example.invalid',
  displayName: 'Workout test',
  avatarUrl: null,
};
export const fixtureSessionId = '00000000-0000-4000-8000-000000000044';
export const fixtureAuth = {
  user: fixtureUser,
  session: {
    accessToken: 'workout-fixture',
    refreshToken: 'workout-fixture',
    accessTokenExpiresAt: '2999-01-01T00:00:00.000Z',
  },
};
export const secondFixtureSessionId = '00000000-0000-4000-8000-000000000054';
export const secondFixtureAuth = {
  user: {
    ...fixtureUser,
    id: '00000000-0000-4000-8000-000000000051',
    email: 'second-workout@example.invalid',
    displayName: 'Second workout test',
  },
  session: {
    ...fixtureAuth.session,
    accessToken: 'second-workout-fixture',
    refreshToken: 'second-workout-fixture',
  },
};

export async function workoutFixture(auth = fixtureAuth, sessionId = fixtureSessionId) {
  const updatedAt = new Date().toISOString();
  const server = fakeSyncServer();
  const client = server.clientFor(auth.user.id);
  const snapshot: WorkoutSnapshot = {
    planName: 'Browser acceptance',
    dayName: 'Workout acceptance',
    difficulty: 'standard',
    restDay: false,
    exercises: [
      {
        exerciseId: 'Barbell_Bench_Press',
        name: 'Bench press',
        sets: 3,
        targetReps: 8,
        targetTimeSeconds: null,
        targetDistanceMetres: null,
        restSeconds: 60,
        logFields: ['reps', 'weight'],
      },
      {
        exerciseId: 'One_Arm_Dumbbell_Row',
        name: 'One arm dumbbell row with a deliberately long exercise name',
        sets: 3,
        targetReps: 10,
        targetTimeSeconds: null,
        targetDistanceMetres: null,
        restSeconds: 60,
        logFields: ['reps', 'weight', 'RPE', 'notes'],
      },
      {
        exerciseId: 'Barbell_Bench_Press',
        name: 'Bench press',
        sets: 1,
        targetReps: 12,
        targetTimeSeconds: null,
        targetDistanceMetres: null,
        restSeconds: 30,
        logFields: ['reps', 'weight'],
      },
    ],
  };
  await client.post('/sync/push', {
    protocol: 2,
    changes: {
      workout_sessions: [
        {
          id: sessionId,
          planId: '00000000-0000-4000-8000-000000000042',
          dayId: '00000000-0000-4000-8000-000000000043',
          localDate: updatedAt.slice(0, 10),
          startedAt: updatedAt,
          endedAt: null,
          status: 'active',
          notes: '',
          easierToday: false,
          snapshot,
          updatedAt,
          deletedAt: null,
        },
      ],
    },
  });
  const profile = {
    goal: null,
    experience: null,
    trainingPlace: null,
    unitSystem: 'metric',
    birthYear: null,
    sex: null,
    heightCm: null,
    daysPerWeek: null,
    limitations: null,
    onboardingStatus: 'skipped',
    updatedAt,
  };
  return { server, client, profile, auth };
}
