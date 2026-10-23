import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { LoggedSetValues } from './LoggedSetValues';
import type { ExercisePerformancesPage } from './exercisePerformances';
import { comparePerformances } from './performanceComparison';
import { fieldLabel, setDraft, type Units } from './workoutForm';

type Entry = ExercisePerformancesPage['entries'][number];
export function ExercisePerformanceCard({
  entry,
  previous,
  units,
  open,
}: {
  entry: Entry;
  previous: Entry | null;
  units: Units;
  open: () => void;
}) {
  const comparison = comparePerformances(entry.log, previous?.log ?? null);
  const changes = setDraft(
    Object.fromEntries(comparison.metrics.map((metric) => [metric.field, metric.change])),
    units,
  );
  return (
    <Card>
      <AppText variant="bodyStrong">
        {entry.dayName} · {entry.localDate}
      </AppText>
      <AppText color="text2">
        {entry.planName} · Set {entry.log.setIndex + 1}
      </AppText>
      <AppText variant="caption" color="text2">
        Performed: {new Date(entry.loggedMs).toLocaleString()}
      </AppText>
      <AppText variant="caption" color="text2">
        Separate sides not recorded.
      </AppText>
      <LoggedSetValues log={entry.log} units={units} />
      {previous ? (
        <AppText variant="label">
          Compared with {previous.dayName} on {previous.localDate}
        </AppText>
      ) : null}
      {comparison.reason ? <AppText color="text2">{comparison.reason}</AppText> : null}
      {comparison.metrics.map((metric) => {
        const value = changes[metric.field] ?? '';
        return (
          <AppText key={metric.field} color="text2">
            {fieldLabel(metric.field, units)} change: {value.startsWith('-') ? value : `+${value}`}
          </AppText>
        );
      })}
      <Button
        label={`Open workout for set ${entry.log.setIndex + 1} on ${entry.localDate}`}
        variant="secondary"
        onPress={open}
      />
    </Card>
  );
}
