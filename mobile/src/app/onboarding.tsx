import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore, useMe } from '@/features/auth/AuthProvider';
import { ONBOARDING_STEPS, finishPatch, isAnswered, skipPatch, type OnboardingAnswers } from '@/features/onboarding/onboarding';
import { EXPERIENCE_OPTIONS, GOAL_OPTIONS, PLACE_OPTIONS, type Option } from '@/features/profile/labels';
import type { ProfilePatch } from '@/features/profile/types';
import { useAppTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { OptionCard } from '@/ui/OptionCard';
import { TextField } from '@/ui/TextField';

const QUESTIONS = {
  name: { title: 'What should we call you?', hint: 'Shown on your profile and anything you share.' },
  goal: { title: 'What are you training for?', hint: 'Shapes the plans and tips you see first. Change it any time.' },
  experience: { title: 'How long have you been training?', hint: 'Helps pick a sensible starting point.' },
  place: { title: 'Where do you train?', hint: 'So plans only use equipment you have.' },
} as const;

export default function OnboardingScreen() {
  const { colors, radius, space } = useAppTheme();
  const auth = useAuthStore();
  const { me } = useMe();
  const currentName = me?.user.displayName ?? '';
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({ displayName: currentName });
  const [saving, setSaving] = useState(false);

  const step = ONBOARDING_STEPS[index]!;
  const last = index === ONBOARDING_STEPS.length - 1;
  const question = QUESTIONS[step];
  const set = (patch: OnboardingAnswers) => setAnswers((current) => ({ ...current, ...patch }));

  // Saving puts the answers on the phone first; the route guard then moves to Home on its own,
  // even with no connection.
  async function save(patch: ProfilePatch) {
    setSaving(true);
    try {
      await auth.updateProfile(patch);
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (last) void save(finishPatch(answers, currentName));
    else setIndex(index + 1);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md }}>
          <View
            style={{ flex: 1, flexDirection: 'row', gap: space.xs }}
            accessible
            accessibilityLabel={`Question ${index + 1} of ${ONBOARDING_STEPS.length}`}>
            {ONBOARDING_STEPS.map((s, i) => (
              <View key={s} style={{ flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: i <= index ? colors.accent : colors.surface2 }} />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => save(skipPatch(answers, currentName))}
            hitSlop={8}
            style={{ minHeight: touchTarget, justifyContent: 'center' }}>
            <AppText variant="bodyStrong" color="text2">Skip for now</AppText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.sm }}>
            <AppText variant="label" color="accent">{`${index + 1} of ${ONBOARDING_STEPS.length}`}</AppText>
            <AppText variant="display" accessibilityRole="header">{question.title}</AppText>
            <AppText color="text2">{question.hint}</AppText>
          </View>

          {step === 'name' ? (
            <TextField
              label="Display name"
              value={answers.displayName ?? ''}
              onChangeText={(displayName) => set({ displayName })}
              maxLength={60}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={next}
            />
          ) : step === 'goal' ? (
            <Choices options={GOAL_OPTIONS} value={answers.goal} onChange={(goal) => set({ goal })} />
          ) : step === 'experience' ? (
            <Choices options={EXPERIENCE_OPTIONS} value={answers.experience} onChange={(experience) => set({ experience })} />
          ) : (
            <Choices options={PLACE_OPTIONS} value={answers.trainingPlace} onChange={(trainingPlace) => set({ trainingPlace })} />
          )}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: space.md, padding: space.lg, borderTopWidth: 1, borderTopColor: colors.line }}>
          {index > 0 ? <Button label="Back" variant="secondary" disabled={saving} onPress={() => setIndex(index - 1)} /> : null}
          <Button
            label={last ? 'Finish' : isAnswered(step, answers) ? 'Continue' : 'Skip'}
            disabled={saving}
            onPress={next}
            style={{ flex: 1 }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Choices<T extends string>({ options, value, onChange }: { options: Option<T>[]; value: T | undefined; onChange: (value: T) => void }) {
  const { space } = useAppTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
      {options.map((option) => (
        <OptionCard
          key={option.value}
          label={option.label}
          description={option.description}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}
