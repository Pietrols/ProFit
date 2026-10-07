import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useAuthStore, useMe } from '@/features/auth/AuthProvider';
import { EXPERIENCE_OPTIONS, GOAL_OPTIONS, PLACE_OPTIONS, SEX_OPTIONS, UNIT_OPTIONS } from '@/features/profile/labels';
import { formFromMe, validateProfileForm, type FormErrors, type ProfileForm } from '@/features/profile/profileForm';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ChipGroup } from '@/ui/ChipGroup';
import { EmptyState } from '@/ui/EmptyState';
import { TextField } from '@/ui/TextField';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }));

export default function ProfileScreen() {
  const { me } = useMe();
  if (!me) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Profile not loaded yet"
        message="Your profile has not reached this phone yet. Connect to the internet and it will appear here."
      />
    );
  }
  return <ProfileEditor key={me.user.id} />;
}

function ProfileEditor() {
  const { colors, space } = useAppTheme();
  const auth = useAuthStore();
  const { me } = useMe();
  const initial = useMemo(() => formFromMe(me!), [me]);
  const [form, setForm] = useState<ProfileForm>(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<ProfileForm>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    const result = validateProfileForm(form, me!, new Date());
    setErrors(result.errors);
    if (Object.keys(result.errors).length) return;
    setSaving(true);
    try {
      // Saved on the phone straight away; sent to the server now or when the connection is back.
      if (Object.keys(result.patch).length) await auth.updateProfile(result.patch);
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxxl }} keyboardShouldPersistTaps="handled">
        <Card>
          <AppText variant="title">About you</AppText>
          <TextField label="Display name" value={form.displayName} onChangeText={(displayName) => set({ displayName })} maxLength={60} error={errors.displayName} />
          <ChipGroup label="Goal" options={GOAL_OPTIONS} value={form.goal} onChange={(goal) => set({ goal })} />
          <ChipGroup label="Experience" options={EXPERIENCE_OPTIONS} value={form.experience} onChange={(experience) => set({ experience })} />
          <ChipGroup label="Where you train" options={PLACE_OPTIONS} value={form.trainingPlace} onChange={(trainingPlace) => set({ trainingPlace })} />
          <ChipGroup
            label="Days per week"
            options={DAY_OPTIONS}
            value={form.daysPerWeek}
            onChange={(daysPerWeek) => set({ daysPerWeek })}
            hint="How many days you usually train."
          />
        </Card>

        <Card>
          <AppText variant="title">Body details</AppText>
          <AppText variant="caption" color="text2">Optional. Used for your calorie target and to set sensible starting points.</AppText>
          <ChipGroup
            label="Units"
            options={UNIT_OPTIONS}
            value={form.unitSystem}
            clearable={false}
            onChange={(unitSystem) => unitSystem && set({ unitSystem })}
          />
          <TextField label="Birth year" value={form.birthYear} onChangeText={(birthYear) => set({ birthYear })} keyboardType="number-pad" maxLength={4} placeholder="1996" error={errors.birthYear} />
          <ChipGroup label="Sex" options={SEX_OPTIONS} value={form.sex} onChange={(sex) => set({ sex })} hint="Used only for calorie estimates." />
          {form.unitSystem === 'metric' ? (
            <TextField label="Height (cm)" value={form.heightCm} onChangeText={(heightCm) => set({ heightCm })} keyboardType="decimal-pad" maxLength={5} placeholder="175" error={errors.height} />
          ) : (
            <View style={{ gap: space.xs }}>
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <TextField label="Height (ft)" value={form.heightFeet} onChangeText={(heightFeet) => set({ heightFeet })} keyboardType="number-pad" maxLength={1} placeholder="5" />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label="(in)" value={form.heightInches} onChangeText={(heightInches) => set({ heightInches })} keyboardType="number-pad" maxLength={2} placeholder="9" />
                </View>
              </View>
              {errors.height ? <AppText variant="caption" color="caution">{errors.height}</AppText> : null}
            </View>
          )}
          <TextField
            label="Injuries or limits"
            value={form.limitations}
            onChangeText={(limitations) => set({ limitations })}
            multiline
            maxLength={500}
            placeholder="For example: sore left knee, no overhead pressing"
            hint="Plans and the coach avoid what you list here."
            error={errors.limitations}
            textAlignVertical="top"
          />
        </Card>

        <Button label={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
