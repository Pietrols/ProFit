// First-run onboarding wizard (Piece 2). Shown once after account creation
// (server-tracked via User.onboardedAt), skippable at every step, and
// revisitable from Profile. The recommended plan is only written after an
// explicit "Add this plan" confirmation, via the existing plan-creation path.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { api, NetworkError } from '../../api/client';
import { StarterTemplate, TrainingContext } from '../../api/types';
import { getDb } from '../../data/db';
import { setMeta } from '../../data/exercisesRepo';
import { saveActivePlan } from '../../data/planRepo';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Body,
  Button,
  ChipRow,
  ErrorBanner,
  Heading,
  KeyboardForm,
  LoadingView,
  Screen,
  TextField,
  Title,
} from '../../ui';
import { useAuth, useUser } from '../auth/AuthContext';
import {
  INJURY_OPTIONS,
  OnboardingAgeBand,
  OnboardingExperience,
  OnboardingGoal,
  recommendTemplate,
} from './recommendTemplate';

// Same copy as the server-side template disclaimer (Piece 1) — shown before
// the recommendation is fetched, so it lives client-side too.
const DISCLAIMER =
  'ProFit offers general fitness information, not medical advice. Check with ' +
  'your doctor before starting a new exercise program — especially if you ' +
  'have joint, heart, or other existing health conditions.';

const EXPERIENCES: readonly OnboardingExperience[] = [
  'new',
  'returning',
  'consistent',
];
const EXPERIENCE_LABELS: Record<OnboardingExperience, string> = {
  new: 'New to training',
  returning: 'Getting back into it',
  consistent: 'Training regularly',
};

const AGE_BANDS: readonly OnboardingAgeBand[] = [
  'under-40',
  '40-59',
  '60-plus',
];
const AGE_LABELS: Record<OnboardingAgeBand, string> = {
  'under-40': 'Under 40',
  '40-59': '40 – 59',
  '60-plus': '60+',
};

const GOALS: readonly OnboardingGoal[] = [
  'general',
  'fat_loss',
  'chest_arms_shoulders',
  'glutes_legs',
];
const GOAL_LABELS: Record<OnboardingGoal, string> = {
  general: 'Get fit overall',
  fat_loss: 'Lose fat',
  chest_arms_shoulders: 'Build chest, arms & shoulders',
  glutes_legs: 'Build glutes & legs',
};

const CONTEXTS: readonly TrainingContext[] = ['home', 'gym'];

type Step =
  | 'welcome'
  | 'experience'
  | 'age'
  | 'context'
  | 'goal'
  | 'injuries'
  | 'disclaimer'
  | 'recommend';

const STEPS: Step[] = [
  'welcome',
  'experience',
  'age',
  'context',
  'goal',
  'injuries',
  'disclaimer',
  'recommend',
];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const t = useAppTheme();
  const user = useUser();
  const { session, updateProfile } = useAuth();

  const [step, setStep] = useState<Step>('welcome');
  const [experience, setExperience] = useState<OnboardingExperience | null>(null);
  const [ageBand, setAgeBand] = useState<OnboardingAgeBand | null>(null);
  const [context, setContext] = useState<TrainingContext>(user.defaultContext);
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);
  const [injuries, setInjuries] = useState<string[]>([]);
  const [injuryNote, setInjuryNote] = useState('');
  const [acked, setAcked] = useState(false);

  const [template, setTemplate] = useState<StarterTemplate | null>(null);
  const [recStatus, setRecStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.indexOf(step);

  async function finish() {
    // Never block leaving the wizard on connectivity — mark done best-effort.
    // Injury considerations ride along so the AI coach can respect them
    // server-side (AUDIT U4).
    const notes = [...injuries, injuryNote.trim()].filter(Boolean).join('; ');
    try {
      await updateProfile({ onboarded: true, ...(notes ? { injuryNotes: notes } : {}) });
    } catch {
      // Offline: the wizard may show again next cold start; acceptable.
    }
    onDone();
  }

  const answers = useCallback(() => {
    if (!experience || !ageBand || !goal) return null;
    return { experience, ageBand, context, goal, injuries, injuryNote };
  }, [experience, ageBand, context, goal, injuries, injuryNote]);

  const loadRecommendation = useCallback(async () => {
    const a = answers();
    if (!a || !session) return;
    setRecStatus('loading');
    const rec = recommendTemplate(a);
    try {
      const { templates } = await api.listTemplates(
        session.token,
        a.context,
        rec.experience,
      );
      const found = templates.find((x) => x.id === rec.templateId) ?? null;
      setTemplate(found);
      setRecStatus(found ? 'ready' : 'error');
    } catch {
      setRecStatus('error');
    }
  }, [answers, session]);

  useEffect(() => {
    if (step === 'recommend') void loadRecommendation();
  }, [step, loadRecommendation]);

  async function addPlan() {
    const a = answers();
    if (!a || !session || !template) return;
    setAdding(true);
    setError(null);
    const rec = recommendTemplate(a);
    try {
      const { plan } = await api.createPlanFromTemplate(session.token, {
        templateId: rec.templateId,
        context: a.context,
        experience: rec.experience,
      });
      await saveActivePlan(await getDb(), plan);
      // Remember injury considerations locally for later coaching context.
      await setMeta(
        await getDb(),
        'onboarding.injuries',
        JSON.stringify({ injuries: a.injuries, note: a.injuryNote }),
      );
      await finish();
    } catch (e) {
      setError(
        e instanceof NetworkError
          ? 'Offline — could not add the plan. Try again when connected.'
          : 'Could not add the plan. Please try again.',
      );
      setAdding(false);
    }
  }

  const canContinue =
    step === 'welcome' ||
    step === 'injuries' ||
    (step === 'experience' && experience !== null) ||
    (step === 'age' && ageBand !== null) ||
    step === 'context' ||
    (step === 'goal' && goal !== null) ||
    (step === 'disclaimer' && acked);

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

  function body() {
    switch (step) {
      case 'welcome':
        return (
          <>
            <Title>Welcome</Title>
            <AccentRule />
            <Body muted>
              A few quick questions and we&apos;ll suggest a starter plan that
              fits you. You can skip this and set things up yourself any time.
            </Body>
          </>
        );
      case 'experience':
        return (
          <>
            <Heading>Where are you starting from?</Heading>
            <AccentRule />
            {section(
              'Experience',
              <ChipRow
                options={EXPERIENCES}
                value={experience}
                onChange={setExperience}
                labels={EXPERIENCE_LABELS}
              />,
            )}
          </>
        );
      case 'age':
        return (
          <>
            <Heading>Your age range</Heading>
            <AccentRule />
            <View style={{ marginBottom: t.spacing.lg }}>
              <Body muted>
                Only used to pick a kinder starting intensity — never your goal.
              </Body>
            </View>
            {section(
              'Age',
              <ChipRow
                options={AGE_BANDS}
                value={ageBand}
                onChange={setAgeBand}
                labels={AGE_LABELS}
              />,
            )}
          </>
        );
      case 'context':
        return (
          <>
            <Heading>Where will you train?</Heading>
            <AccentRule />
            {section(
              'Context',
              <ChipRow options={CONTEXTS} value={context} onChange={setContext} />,
            )}
          </>
        );
      case 'goal':
        return (
          <>
            <Heading>What do you want?</Heading>
            <AccentRule />
            <View style={{ marginBottom: t.spacing.lg }}>
              <Body muted>Your answer decides the plan — nothing else does.</Body>
            </View>
            {section(
              'Goal',
              <ChipRow
                options={GOALS}
                value={goal}
                onChange={setGoal}
                labels={GOAL_LABELS}
              />,
            )}
          </>
        );
      case 'injuries':
        return (
          <>
            <Heading>Anything to work around?</Heading>
            <AccentRule />
            <View style={{ marginBottom: t.spacing.lg }}>
              <Body muted>Optional — tap any joints that need extra care.</Body>
            </View>
            {section(
              'Considerations',
              <ChipRow
                options={INJURY_OPTIONS}
                value={null}
                multiValues={injuries}
                onChange={(opt) =>
                  setInjuries((prev) =>
                    prev.includes(opt)
                      ? prev.filter((x) => x !== opt)
                      : [...prev, opt],
                  )
                }
              />,
            )}
            <TextField
              label="Anything else (optional)"
              value={injuryNote}
              onChangeText={setInjuryNote}
              placeholder="e.g. recovering from ankle sprain"
            />
          </>
        );
      case 'disclaimer':
        return (
          <>
            <Heading>Before you start</Heading>
            <AccentRule />
            <View style={{ marginBottom: t.spacing.lg }}>
              <Body muted>{DISCLAIMER}</Body>
            </View>
            <Pressable
              onPress={() => setAcked((a) => !a)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acked }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.sm,
                backgroundColor: acked ? t.colors.gdim : t.colors.s2,
                borderColor: acked ? t.colors.green : t.colors.line,
                borderWidth: 1,
                borderRadius: t.radius.md,
                padding: t.spacing.md,
              }}
            >
              <MaterialCommunityIcons
                name={acked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={22}
                color={acked ? t.colors.green : t.colors.tx3}
              />
              <View style={{ flex: 1 }}>
                <Body>I understand — this is general guidance, not medical advice.</Body>
              </View>
            </Pressable>
          </>
        );
      case 'recommend': {
        if (recStatus === 'loading') return <LoadingView />;
        if (recStatus === 'error' || !template) {
          return (
            <ErrorBanner
              message="Could not load your recommendation."
              onRetry={loadRecommendation}
            />
          );
        }
        return (
          <>
            <Heading>Our suggestion</Heading>
            <AccentRule />
            <Title>{template.title}</Title>
            <View style={{ marginVertical: t.spacing.md }}>
              <Body muted>{template.description}</Body>
            </View>
            {template.days.map((d) => (
              <View
                key={d.name}
                style={{
                  backgroundColor: t.colors.s1,
                  borderRadius: t.radius.md,
                  padding: t.spacing.md,
                  marginBottom: t.spacing.sm,
                }}
              >
                <Text
                  style={{
                    fontFamily: t.typography.label,
                    fontSize: 13,
                    color: t.colors.tx2,
                    textTransform: 'uppercase',
                    marginBottom: t.spacing.xs,
                  }}
                >
                  {d.name}
                </Text>
                {d.exercises.map((e) => (
                  <Text
                    key={e.exerciseId}
                    style={{
                      fontFamily: t.typography.body,
                      fontSize: 14,
                      color: t.colors.tx,
                    }}
                  >
                    {e.exercise.name} — {e.sets}×{e.reps}
                  </Text>
                ))}
              </View>
            ))}
            <View style={{ marginVertical: t.spacing.md }}>
              <Body muted>{template.disclaimer}</Body>
            </View>
            {error ? <ErrorBanner message={error} onRetry={addPlan} /> : null}
          </>
        );
      }
    }
  }

  return (
    <Screen>
      {/* progress + skip */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: t.spacing.lg,
        }}
      >
        <View style={{ flexDirection: 'row', gap: t.spacing.xs }}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={{
                width: 20,
                height: 3,
                borderRadius: t.radius.sm,
                backgroundColor: i <= stepIndex ? t.colors.green : t.colors.s2,
              }}
            />
          ))}
        </View>
        <Pressable onPress={finish} hitSlop={8} accessibilityRole="button">
          <Text
            style={{
              fontFamily: t.typography.label,
              fontSize: 13,
              color: t.colors.tx3,
              textTransform: 'uppercase',
            }}
          >
            Skip
          </Text>
        </Pressable>
      </View>

      <KeyboardForm centered={false}>{body()}</KeyboardForm>

      <View style={{ gap: t.spacing.sm, marginTop: t.spacing.md }}>
        {step === 'recommend' ? (
          recStatus === 'ready' && template ? (
            <>
              <Button label="Add this plan" onPress={addPlan} busy={adding} />
              <Button label="Not now" variant="ghost" onPress={finish} />
            </>
          ) : (
            <Button label="Finish without a plan" variant="ghost" onPress={finish} />
          )
        ) : (
          <>
            <Button
              label={step === 'welcome' ? "Let's go" : 'Continue'}
              onPress={() => setStep(STEPS[stepIndex + 1])}
              disabled={!canContinue}
            />
            {stepIndex > 0 ? (
              <Button
                label="Back"
                variant="ghost"
                onPress={() => setStep(STEPS[stepIndex - 1])}
              />
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}
