import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { NetworkError } from '../../api/client';
import { Goal, TrainingContext, Units } from '../../api/types';
import { listBodyweightLocal } from '../../data/bodyweightRepo';
import { getDb } from '../../data/db';
import { listMealsLocal } from '../../data/nutritionRepo';
import { listSessionsLocal } from '../../data/workoutRepo';
import { buildExportJson, buildSetsCsv } from '../settings/exportData';
import {
  applyReminders,
  clearReminders,
  loadReminderSettings,
  WEEKDAY_LABELS,
} from '../settings/reminders';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Button,
  ChipRow,
  ErrorBanner,
  Heading,
  KeyboardForm,
  Screen,
  Title,
} from '../../ui';
import { useAuth, useUser } from '../auth/AuthContext';

const GOALS: readonly Goal[] = ['bulking', 'cutting', 'maintaining'];
const CONTEXTS: readonly TrainingContext[] = ['home', 'gym'];
const UNITS: readonly Units[] = ['kg', 'lb'];
const DAYS = ['2', '3', '4', '5', '6', '7'] as const;

export function ProfileScreen() {
  const t = useAppTheme();
  const user = useUser();
  const { updateProfile, logout } = useAuth();

  const [goal, setGoal] = useState<Goal>(user.goal);
  const [days, setDays] = useState(String(user.trainingDays));
  const [context, setContext] = useState<TrainingContext>(user.defaultContext);
  const [units, setUnits] = useState<Units>(user.units);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // reminders + export
  const [reminderDays, setReminderDays] = useState<string[]>([]);
  const [reminderHour, setReminderHour] = useState<'7' | '12' | '18'>('18');
  const [reminderNote, setReminderNote] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);

  useEffect(() => {
    loadReminderSettings().then((s) => {
      if (s) {
        setReminderDays(s.weekdays.map(String));
        setReminderHour(String(s.hour) as '18');
      }
    });
  }, []);

  async function saveReminders() {
    setReminderNote(null);
    if (reminderDays.length === 0) {
      await clearReminders();
      setReminderNote('Reminders off.');
      return;
    }
    const result = await applyReminders({
      weekdays: reminderDays.map(Number),
      hour: Number(reminderHour),
    }).catch(() => 'unsupported' as const);
    setReminderNote(
      result === 'ok'
        ? `Reminders set for ${reminderDays.length} day(s) at ${reminderHour}:00.`
        : result === 'denied'
          ? 'Notifications are blocked — allow them in system settings.'
          : 'Reminders need the installed app (not Expo Go) — they will work in the release build.',
    );
  }

  async function exportData(format: 'json' | 'csv') {
    setExportNote(null);
    try {
      const db = await getDb();
      const sessions = (await listSessionsLocal(db)).map((r) => r.payload);
      const stamp = new Date().toISOString().slice(0, 10);
      let content: string;
      let filename: string;
      if (format === 'json') {
        content = buildExportJson(
          {
            sessions,
            bodyweight: await listBodyweightLocal(db),
            meals: await listMealsLocal(db),
          },
          new Date().toISOString(),
        );
        filename = `profit-export-${stamp}.json`;
      } else {
        content = buildSetsCsv(sessions);
        filename = `profit-sets-${stamp}.csv`;
      }
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.create();
      file.write(content);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri);
      }
      setExportNote(`Exported ${filename}.`);
    } catch {
      setExportNote('Export failed — please try again.');
    }
  }

  const dirty =
    goal !== user.goal ||
    Number(days) !== user.trainingDays ||
    context !== user.defaultContext ||
    units !== user.units;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile({
        goal,
        trainingDays: Number(days),
        defaultContext: context,
        units,
      });
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof NetworkError
          ? 'Offline — changes not saved yet. Try again when connected.'
          : 'Could not save your profile. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const section = (label: string, child: React.ReactNode) => (
    <View style={{ marginBottom: t.spacing.xl }}>
      <Text
        style={{
          fontFamily: t.typography.label,
          fontSize: 13,
          color: t.colors.tx2,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: t.spacing.sm,
        }}
      >
        {label}
      </Text>
      {child}
    </View>
  );

  return (
    <Screen>
      <KeyboardForm centered={false}>
        <Title>{user.displayName}</Title>
        <AccentRule />
        <Text
          style={{
            fontFamily: t.typography.body,
            color: t.colors.tx2,
            marginBottom: t.spacing.xl,
          }}
        >
          {user.email}
        </Text>

        {error ? <ErrorBanner message={error} onRetry={save} /> : null}
        {saved && !dirty ? (
          <View
            style={{
              backgroundColor: t.colors.gdim,
              borderRadius: t.radius.md,
              padding: t.spacing.md,
              marginBottom: t.spacing.lg,
            }}
          >
            <Text style={{ fontFamily: t.typography.body, color: t.colors.green }}>
              Profile saved.
            </Text>
          </View>
        ) : null}

        {section('Goal', <ChipRow options={GOALS} value={goal} onChange={setGoal} />)}
        {section(
          'Training days / week',
          <ChipRow options={DAYS} value={days as (typeof DAYS)[number]} onChange={setDays} />,
        )}
        {section(
          'Default context',
          <ChipRow options={CONTEXTS} value={context} onChange={setContext} />,
        )}
        {section('Units', <ChipRow options={UNITS} value={units} onChange={setUnits} />)}

        <Button label="Save changes" onPress={save} busy={busy} disabled={!dirty} />

        <View style={{ height: t.spacing.xl }} />
        <Heading>Session reminders</Heading>
        <View style={{ marginTop: t.spacing.sm, gap: t.spacing.sm }}>
          <ChipRow
            options={['2', '3', '4', '5', '6', '7', '1'] as const}
            value={null}
            multiValues={reminderDays}
            onChange={(d) =>
              setReminderDays((prev) =>
                prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
              )
            }
            labels={Object.fromEntries(
              Object.entries(WEEKDAY_LABELS).map(([k, v]) => [String(k), v]),
            )}
          />
          <ChipRow
            options={['7', '12', '18'] as const}
            value={reminderHour}
            onChange={setReminderHour}
            labels={{ '7': '7:00', '12': '12:00', '18': '18:00' }}
          />
          <Button label="Save reminders" variant="ghost" onPress={saveReminders} />
          {reminderNote ? (
            <Text style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.tx2 }}>
              {reminderNote}
            </Text>
          ) : null}
        </View>

        <View style={{ height: t.spacing.xl }} />
        <Heading>Your data</Heading>
        <View style={{ marginTop: t.spacing.sm, gap: t.spacing.sm }}>
          <Button label="Export everything (JSON)" variant="ghost" onPress={() => exportData('json')} />
          <Button label="Export sets (CSV)" variant="ghost" onPress={() => exportData('csv')} />
          {exportNote ? (
            <Text style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.tx2 }}>
              {exportNote}
            </Text>
          ) : null}
        </View>

        <View style={{ height: t.spacing.xl }} />
        <Button label="Log out" onPress={logout} variant="danger" />
        <View style={{ height: t.spacing.xxl }} />
      </KeyboardForm>
    </Screen>
  );
}
