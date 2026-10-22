import type { ApiClient } from '../mobile/src/lib/api/client';
import { uuidv5 } from '../mobile/src/lib/uuid';
import { setLogId } from '../mobile/src/features/workouts/identity';
import type { WorkoutSnapshot } from '../mobile/src/features/workouts/types';

// Own disposable records for rendered history checks. No real plan/account data is read.
export async function seedWorkoutHistory(fixture: {
  client: ApiClient;
  auth: { user: { id: string } };
}) {
  const user = fixture.auth.user.id;
  const base = new Date();
  base.setUTCDate(base.getUTCDate() - 1);
  base.setUTCHours(0, 0, 0, 0);
  const localDate = base.toISOString().slice(0, 10);
  const updatedAt = new Date().toISOString();
  const planId = uuidv5('history-plan', user);
  const dayId = uuidv5('history-day', planId);
  const sessions = Array.from({ length: 30 }, (_, index) => {
    const id = uuidv5(`history-session:${index}`, user);
    const startedAt = new Date(base.getTime() + index * 600_000).toISOString();
    const snapshot: WorkoutSnapshot = {
      planName: 'History routine',
      dayName: `History session ${index + 1}`,
      difficulty: 'standard',
      restDay: index === 1,
      exercises:
        index === 1
          ? []
          : [
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
            ],
    };
    return {
      id,
      planId,
      dayId,
      localDate,
      startedAt,
      endedAt: new Date(Date.parse(startedAt) + 120_000).toISOString(),
      status: index === 0 ? 'abandoned' : 'completed',
      notes: '',
      easierToday: false,
      snapshot,
      updatedAt,
      deletedAt: null,
    };
  });
  const logs = sessions.flatMap((session, index) =>
    session.snapshot.restDay
      ? []
      : [
          {
            id: setLogId(session.id, 0, 0),
            sessionId: session.id,
            exercisePosition: 0,
            setIndex: 0,
            loggedAt: new Date(Date.parse(session.startedAt) + 60_000).toISOString(),
            logFields: ['reps', 'weight'],
            values: { reps: 8, weight: 45 + index },
            updatedAt,
            deletedAt: null,
          },
        ],
  );
  await fixture.client.post('/sync/push', {
    protocol: 2,
    changes: { workout_sessions: sessions, set_logs: logs },
  });
  return {
    seeded: sessions.length,
    localDate,
    latestId: sessions.at(-1)!.id,
    exerciseId: 'Barbell_Bench_Press',
  };
}
