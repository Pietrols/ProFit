import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { SyncBanner } from '@/features/sync/SyncBanner';
import { useSyncStatus } from '@/features/sync/SyncProvider';
import { changeSincePrevious } from '@/features/weight/summary';
import { formatWeight } from '@/features/weight/units';
import { useWeightLog } from '@/features/weight/useWeightLog';
import { WeightForm } from '@/features/weight/WeightForm';
import { formatDay, localDay } from '@/lib/dates';
import { useAppTheme } from '@/theme/ThemeProvider';
import { fontFamilies } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';

export default function ProgressScreen() {
  const { colors, space } = useAppTheme();
  const snapshot = useAuth();
  const unitSystem = snapshot.status === 'signedIn' ? (snapshot.me?.profile.unitSystem ?? 'metric') : 'metric';
  const { entries, error, save, remove } = useWeightLog();
  const [formDay, setFormDay] = useState<string | null>(null);
  const today = localDay(new Date());

  if (error) {
    return (
      <Screen>
        <EmptyState icon="warning-outline" title="Could not load your log" message={error} />
      </Screen>
    );
  }
  if (!entries) return <Screen>{null}</Screen>;

  const latest = entries[0] ?? null;
  const loggedToday = latest?.date === today;
  const change = changeSincePrevious(entries, unitSystem, today);

  return (
    <Screen>
      <SyncBanner />

      <Card>
        <AppText variant="label" color="text2">Body weight</AppText>
        {latest ? (
          <View style={{ gap: 2 }}>
            <AppText style={{ fontFamily: fontFamilies.display, fontSize: 56, lineHeight: 58, color: colors.text }} accessibilityLabel={`Latest weight ${formatWeight(latest.weightKg, unitSystem)}`}>
              {formatWeight(latest.weightKg, unitSystem).toUpperCase()}
            </AppText>
            <AppText color="text2">{formatDay(latest.date, today)}{change ? `  ·  ${change}` : ''}</AppText>
          </View>
        ) : (
          <AppText color="text2">Weigh in at the same time each day, ideally in the morning, for numbers you can compare.</AppText>
        )}
        {formDay ? null : (
          <Button
            label={loggedToday ? "Change today's weight" : "Log today's weight"}
            onPress={() => setFormDay(today)}
            style={{ alignSelf: 'flex-start', marginTop: space.sm }}
          />
        )}
      </Card>

      {formDay ? (
        <WeightForm
          key={formDay}
          today={today}
          initialDay={formDay}
          entries={entries}
          unitSystem={unitSystem}
          onSave={save}
          onDelete={remove}
          onClose={() => setFormDay(null)}
        />
      ) : null}

      {entries.length ? (
        <Card style={{ gap: 0, paddingVertical: space.sm }}>
          <AppText variant="label" color="text2" style={{ paddingVertical: space.sm }}>Recent weigh-ins</AppText>
          {entries.map((entry, i) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              accessibilityHint="Opens this weigh-in to change or delete it"
              onPress={() => setFormDay(entry.date)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                minHeight: 52,
                paddingVertical: space.sm,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.line,
                opacity: pressed ? 0.7 : 1,
              })}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">{formatDay(entry.date, today)}</AppText>
                {entry.note ? <AppText variant="caption" color="text2" numberOfLines={1}>{entry.note}</AppText> : null}
              </View>
              <AppText variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{formatWeight(entry.weightKg, unitSystem)}</AppText>
            </Pressable>
          ))}
        </Card>
      ) : formDay ? null : (
        <EmptyState
          icon="scale-outline"
          title="No weigh-ins yet"
          message="Your weigh-ins appear here and sync to every phone you sign in on. Charts arrive once there is a week or two of data."
        />
      )}

      <SyncLine />
    </Screen>
  );
}

function SyncLine() {
  const { pending, syncing, lastSyncedAt, offline } = useSyncStatus();
  let text: string;
  if (syncing) text = 'Syncing…';
  else if (pending > 0) text = `${pending === 1 ? '1 change' : `${pending} changes`} waiting to sync`;
  else if (lastSyncedAt) text = `All synced at ${new Date(lastSyncedAt).toTimeString().slice(0, 5)}`;
  else text = offline ? 'Not synced yet' : '';
  return text ? <AppText variant="caption" color="text2" style={{ textAlign: 'center' }}>{text}</AppText> : null;
}
