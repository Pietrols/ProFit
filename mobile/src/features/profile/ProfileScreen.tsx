import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { NetworkError } from '../../api/client';
import { Goal, TrainingContext, Units } from '../../api/types';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Button,
  ChipRow,
  ErrorBanner,
  Heading,
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
      <ScrollView showsVerticalScrollIndicator={false}>
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
        <View style={{ height: t.spacing.md }} />
        <Button label="Log out" onPress={logout} variant="danger" />
      </ScrollView>
    </Screen>
  );
}
