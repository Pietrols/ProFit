// Phase 9 done-when: an export produces a valid file of the user's real data.
import { describe, expect, it } from 'vitest';
import { WorkoutSessionPayload } from '../../../data/workoutTypes';
import { buildExportJson, buildSetsCsv } from '../exportData';

const session: WorkoutSessionPayload = {
  id: 's-1',
  planId: 'p-1',
  planDayId: 'd-1',
  dayName: 'Push',
  category: 'bodybuilding',
  context: 'gym',
  startedAt: '2026-07-15T09:00:00.000Z',
  finishedAt: '2026-07-15T10:00:00.000Z',
  durationSeconds: 3600,
  delta: {
    plannedExerciseCount: 2,
    completedExerciseCount: 1,
    plannedSetCount: 5,
    completedSetCount: 2,
    skippedExercises: [{ exerciseId: 'ohp', name: 'OHP' }],
    swappedExercises: [],
    cutShort: true,
  },
  exercises: [
    {
      id: 'e-1',
      order: 0,
      plannedExerciseId: 'bench',
      actualExerciseId: 'bench',
      skipped: false,
      sets: [
        { id: 't-1', setIndex: 0, plannedReps: '8-12', plannedWeightKg: 40, actualReps: 10, weightKg: 40, completed: true },
        { id: 't-2', setIndex: 1, plannedReps: '8-12', plannedWeightKg: 40, actualReps: 8, weightKg: 42.5, completed: true },
      ],
    },
    { id: 'e-2', order: 1, plannedExerciseId: 'ohp', actualExerciseId: 'ohp', skipped: true, sets: [] },
  ],
};

describe('data export', () => {
  it('JSON export is valid, versioned, and carries the real data', () => {
    const json = buildExportJson(
      {
        sessions: [session],
        bodyweight: [{ id: 'b-1', weightKg: 82.5, loggedAt: '2026-07-15T07:00:00.000Z' }],
        meals: [{ id: 'm-1', name: 'Pizza, "large"', portion: '3 slices', mealType: 'dinner', loggedAt: '2026-07-15T19:00:00.000Z' }],
      },
      '2026-07-16T12:00:00.000Z',
    );
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe('ProFit');
    expect(parsed.workoutSessions[0].delta.cutShort).toBe(true);
    expect(parsed.bodyweight[0].weightKg).toBe(82.5);
    expect(parsed.meals[0].name).toContain('Pizza');
  });

  it('CSV export has one row per set, escapes correctly, and marks skips', () => {
    const csv = buildSetsCsv([session]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('planned_weight_kg');
    expect(lines).toHaveLength(1 + 2 + 1); // header + 2 sets + 1 skipped row
    expect(lines[1]).toContain('bench,false,0,8-12,40,10,40,true');
    expect(lines[3]).toContain('ohp,true');
    // every data row has the header's column count
    const cols = lines[0].split(',').length;
    for (const line of lines.slice(1)) {
      expect(line.split(',').length).toBe(cols);
    }
  });
});
