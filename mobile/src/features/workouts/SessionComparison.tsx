import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { LoggedSetValues } from './LoggedSetValues';
import { compareSession, targetValues } from './sessionComparison';
import type { StructuredWorkoutDetail } from './structuredDetail';
import type { PerformanceTargets } from './structureTypes';
import { fieldLabel, setDraft, type Units } from './workoutForm';

function TargetLine({ targets, units }: { targets: PerformanceTargets; units: Units }) {
  const shown = setDraft(targetValues(targets), units);
  return (
    <AppText color="text2">
      {targets.sets} sets ·{' '}
      {Object.entries(shown)
        .map(([field, value]) => `${fieldLabel(field as keyof typeof shown, units)}: ${value}`)
        .join(', ')}
    </AppText>
  );
}

export function SessionComparison({
  detail,
  units,
}: {
  detail: StructuredWorkoutDetail;
  units: Units;
}) {
  const { space } = useAppTheme();
  const comparison = useMemo(
    () => compareSession(detail.session, detail.itemView, detail.resultView),
    [detail.session, detail.itemView, detail.resultView],
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const names = new Map(
    comparison.rows.map((row) => [row.id, row.original?.name ?? row.item?.exercise.name]),
  );
  return (
    <View style={{ gap: space.md }}>
      <AppText variant="title">Planned and actual</AppText>
      {!comparison.available ? (
        <AppText color="caution">
          Some saved data is unavailable. This comparison may be incomplete.
        </AppText>
      ) : null}
      {!comparison.rows.length ? (
        <AppText color="text2">No exercises were planned or logged for this session.</AppText>
      ) : null}
      {comparison.rows.map((row) => {
        const open = expanded === row.id;
        const item = row.item;
        const name = row.original?.name ?? item?.exercise.name ?? 'Unavailable exercise';
        return (
          <Card key={row.id}>
            <AppText variant="bodyStrong">{name}</AppText>
            <AppText color="text2">
              {item?.origin === 'replacement'
                ? `Replacement for ${names.get(item.replacesItemId) ?? 'an unavailable exercise'}`
                : row.original
                  ? 'Original routine exercise'
                  : 'Added in this session'}
              {' · '}
              {!item ? 'Unavailable' : item.deletedAt ? 'Removed' : item.state}
            </AppText>
            {item?.reason ? <AppText color="text2">Reason: {item.reason}</AppText> : null}
            <AppText>
              {row.completed} sets logged · {row.currentTargetSets} session target sets ·{' '}
              {row.missing} unlogged
            </AppText>
            {row.original ? (
              <AppText color="text2">
                Original: {row.originalCompleted} / {row.original.sets} sets logged ·{' '}
                {row.originalOmitted} omitted
              </AppText>
            ) : null}
            <Button
              label={`${open ? 'Hide' : 'Review'} ${name} comparison`}
              variant="secondary"
              onPress={() => setExpanded(open ? null : row.id)}
            />
            <Button
              label={`Recent results for ${name}`}
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/workouts/exercise',
                  params: {
                    exerciseId: item?.exercise.exerciseId ?? row.original!.exerciseId,
                    name,
                  },
                })
              }
            />
            {open ? (
              <>
                {row.originalTargets ? (
                  <>
                    <AppText variant="label">Original routine targets</AppText>
                    <TargetLine targets={row.originalTargets} units={units} />
                  </>
                ) : null}
                {row.adjustedTargets ? (
                  <>
                    <AppText variant="label">Adjusted routine targets</AppText>
                    <TargetLine targets={row.adjustedTargets} units={units} />
                    <AppText variant="caption" color="text2">
                      Each saved set keeps the targets used when it was performed.
                    </AppText>
                  </>
                ) : null}
                {!row.sets.length ? (
                  <AppText color="text2">No saved sets for this exercise.</AppText>
                ) : null}
                {row.sets.map(({ result, complete }) => (
                  <View key={result.log.id} style={{ gap: space.sm }}>
                    <AppText variant="bodyStrong">
                      Set {result.log.setIndex + 1} · {complete ? 'Logged' : 'Incomplete'}
                    </AppText>
                    <AppText variant="caption" color="text2">
                      Performed: {new Date(result.log.loggedAt).toLocaleString()}
                    </AppText>
                    <AppText variant="label">Targets at performance</AppText>
                    {result.targetsAtPerformance ? (
                      <TargetLine targets={result.targetsAtPerformance} units={units} />
                    ) : (
                      <AppText color="text2">Unknown for this older result.</AppText>
                    )}
                    <AppText variant="label">Actual</AppText>
                    <LoggedSetValues log={result.log} units={units} />
                  </View>
                ))}
                <AppText variant="caption" color="text2">
                  Use Edit in Logged sets below to correct a saved result.
                </AppText>
              </>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}
