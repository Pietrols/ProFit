import { expect, it } from 'vitest';
import { projectWorkoutHistory } from '../historyProjection';
import { setLogId } from '../identity';
import { at, session, sessionId, set } from './fixtures';

const savedSession = () => ({
  ...session(),
  id: sessionId,
  updatedAt: at(0).toISOString(),
  status: 'completed' as const,
  endedAt: at(5).toISOString(),
});
const savedSet = () => ({
  ...set(),
  id: setLogId(sessionId, 0, 0),
  updatedAt: at(1).toISOString(),
});

it('projects only eligible results and keeps zero distinct from an unknown load', () => {
  const session = savedSession();
  const log = savedSet();
  const zero = projectWorkoutHistory({
    session,
    logs: [{ ...log, values: { reps: 8, weight: 0 } }],
  })[0]!;
  expect(zero).toMatchObject({ weight: 0, reps: 8, eligibleWeight: 0, oneRepMax: null });
  const failed = projectWorkoutHistory({
    session,
    logs: [{ ...log, values: { reps: 0, weight: 80 } }],
  })[0]!;
  expect(failed).toMatchObject({ weight: 80, reps: 0, eligibleWeight: null, oneRepMax: null });
  const unknown = projectWorkoutHistory({ session, logs: [{ ...log, values: { reps: 8 } }] })[0]!;
  expect(unknown).toMatchObject({ weight: null, eligibleWeight: null, oneRepMax: null });
  expect(
    projectWorkoutHistory({
      session: { ...session, status: 'active', endedAt: null },
      logs: [log],
    }),
  ).toEqual([]);
  expect(
    projectWorkoutHistory({ session: { ...session, status: 'abandoned' }, logs: [log] }),
  ).toEqual([]);
  const doneSession = savedSession();
  doneSession.snapshot.exercises[0]!.logFields = ['done'];
  const doneLog = { ...log, values: { done: true }, logFields: ['done' as const] };
  expect(projectWorkoutHistory({ session: doneSession, logs: [doneLog] })).toHaveLength(1);
  expect(
    projectWorkoutHistory({
      session: doneSession,
      logs: [{ ...doneLog, values: { done: false } }],
    }),
  ).toEqual([]);
});

it('uses latest revisions and tombstones, and never includes an invalid slot or foreign session', () => {
  const session = savedSession();
  const log = savedSet();
  expect(
    projectWorkoutHistory({
      session,
      logs: [log, { ...log, updatedAt: at(2).toISOString(), deletedAt: at(2).toISOString() }],
    }),
  ).toEqual([]);
  expect(
    projectWorkoutHistory({ session: { ...session, deletedAt: at(2).toISOString() }, logs: [log] }),
  ).toEqual([]);
  expect(projectWorkoutHistory({ session, logs: [{ ...log, setIndex: 99 }] })).toEqual([]);
  expect(projectWorkoutHistory({ session, logs: [{ ...log, sessionId: 'another' }] })).toEqual([]);
});

it('preserves exact instants and isolates returned log data from its inputs', () => {
  const session = savedSession();
  const log = { ...savedSet(), loggedAt: '2026-10-09T11:01:00.0009+02:00' };
  const before = JSON.stringify({ session, log });
  const result = projectWorkoutHistory({ session, logs: [log] })[0]!;
  expect(result.completedMs).toBe(Date.parse(session.endedAt));
  expect(result.loggedMs).toBe(Date.parse(log.loggedAt));
  expect(result.oneRepMax).toBe(45 * (1 + 8 / 30));
  result.log.values.weight = 1;
  result.log.logFields.pop();
  expect(JSON.stringify({ session, log })).toBe(before);
});
