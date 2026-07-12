// Data export — the user owns their logs (PROJECT.md §1.9). Pure builders
// (unit-tested) turn local SQLite data into JSON / CSV strings; the screen
// writes them to a file and opens the share sheet.
import { BodyweightEntry } from '../../data/bodyweightRepo';
import { MealLog } from '../../data/nutritionRepo';
import { WorkoutSessionPayload } from '../../data/workoutTypes';

export interface ExportBundle {
  sessions: WorkoutSessionPayload[];
  bodyweight: BodyweightEntry[];
  meals: MealLog[];
}

export function buildExportJson(bundle: ExportBundle, exportedAt: string): string {
  return JSON.stringify(
    {
      app: 'ProFit',
      format: 1,
      exportedAt,
      workoutSessions: bundle.sessions,
      bodyweight: bundle.bodyweight,
      meals: bundle.meals,
    },
    null,
    2,
  );
}

const csvEscape = (v: string | number | null): string => {
  if (v === null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per logged set — the spreadsheet-friendly view of training. */
export function buildSetsCsv(sessions: WorkoutSessionPayload[]): string {
  const header =
    'session_id,started_at,day_name,category,context,exercise_id,skipped,set_index,planned_reps,planned_weight_kg,actual_reps,weight_kg,completed';
  const rows: string[] = [header];
  for (const s of [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    for (const e of s.exercises) {
      if (e.skipped) {
        rows.push(
          [s.id, s.startedAt, s.dayName, s.category, s.context, e.actualExerciseId, 'true', '', '', '', '', '', '']
            .map(csvEscape)
            .join(','),
        );
        continue;
      }
      for (const set of e.sets) {
        rows.push(
          [
            s.id,
            s.startedAt,
            s.dayName,
            s.category,
            s.context,
            e.actualExerciseId,
            'false',
            set.setIndex,
            set.plannedReps,
            set.plannedWeightKg,
            set.actualReps,
            set.weightKg,
            String(set.completed),
          ]
            .map(csvEscape)
            .join(','),
        );
      }
    }
  }
  return rows.join('\n');
}
