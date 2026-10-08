import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { validateCustomExercise } from '@/features/exercises/customExercises';
import { changeForm, emptyForm, formFor, MAX_PRIMARY, MAX_SECONDARY, toggleMuscle, toInput, type FormState } from '@/features/exercises/exerciseForm';
import { CATEGORY_LABELS, EQUIPMENT_LABELS, MUSCLE_LABELS, TRACKING_LABELS } from '@/features/exercises/labels';
import { CATEGORIES, EQUIPMENT, MUSCLES, TRACKING } from '@/features/exercises/types';
import { useExerciseLibrary } from '@/features/exercises/useExerciseLibrary';
import { pickPhoto } from '@/features/media/pickPhoto';
import { usePhoto } from '@/features/media/usePhoto';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSyncContext } from '@/features/sync/SyncProvider';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { ChipGroup } from '@/ui/ChipGroup';
import { EmptyState } from '@/ui/EmptyState';
import { MultiChipGroup } from '@/ui/MultiChipGroup';
import { OptionCard } from '@/ui/OptionCard';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((value) => ({ value, label: labels[value] }));

export default function ExerciseFormScreen() {
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const library = useExerciseLibrary();

  if (library.error) {
    return (
      <Screen>
        <EmptyState icon="warning-outline" title="Could not load the library" message={library.error} actionLabel="Try again" onAction={library.retry} />
      </Screen>
    );
  }
  if (!library.exercises) return <Screen>{null}</Screen>;

  const existing = id ? library.find(id) : null;
  if (id && (!existing || existing.origin !== 'custom')) {
    return (
      <Screen>
        <EmptyState icon="help-circle-outline" title="Exercise not found" message="It may have been deleted on another phone." />
      </Screen>
    );
  }
  return <FormBody key={id ?? 'new'} initial={existing ? formFor(existing) : emptyForm(name ?? '')} id={existing?.id} save={library.saveCustom} />;
}

type BodyProps = { initial: FormState; id?: string; save: ReturnType<typeof useExerciseLibrary>['saveCustom'] };

function FormBody({ initial, id, save }: BodyProps) {
  const { space } = useAppTheme();
  const router = useRouter();
  const { photos } = useSyncContext();
  const auth = useAuth();
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const photo = usePhoto(form.photoId);

  // Errors show after the first save attempt, then clear as each field is fixed.
  const errors = submitted ? validateCustomExercise(toInput(form)) : {};
  const update = (change: Parameters<typeof changeForm>[1]) => setForm((f) => changeForm(f, change));

  const choosePhoto = async () => {
    if (auth.status !== 'signedIn') return;
    try {
      const uri = await pickPhoto();
      if (uri) update({ photoId: await photos.addPhoto(auth.userId, uri) });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not add that photo.');
    }
  };

  const submit = async () => {
    setSubmitted(true);
    setProblem(null);
    if (Object.keys(validateCustomExercise(toInput(form))).length) return;
    setSaving(true);
    try {
      const saved = await save(toInput(form), id);
      if (id) router.back();
      else router.replace({ pathname: '/exercises/[id]', params: { id: saved } });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not save the exercise.');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Edit exercise' : 'New exercise' }} />
      <TextField label="Name" value={form.name} onChangeText={(text) => update({ name: text })} placeholder="Sandbag carry" maxLength={80} error={errors.name} autoFocus={!id && !form.name} />

      <View style={{ gap: space.xs }}>
        <AppText variant="label" color="text2">Photo</AppText>
        {photo.status === 'ready' ? <Image source={{ uri: photo.uri }} style={{ width: 120, height: 120, borderRadius: 8 }} accessibilityLabel="Exercise photo" /> : null}
        {photos.available ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label={form.photoId ? 'Change photo' : 'Add a photo'} variant="secondary" onPress={() => void choosePhoto()} />
            {form.photoId ? <Button label="Remove" variant="secondary" onPress={() => update({ photoId: null })} /> : null}
          </View>
        ) : (
          <AppText variant="caption" color="text2">Photos can be added in the app on your phone.</AppText>
        )}
      </View>

      <ChipGroup label="Type" options={options(CATEGORIES, CATEGORY_LABELS)} value={form.category} clearable={false} onChange={(category) => category && update({ category })} />
      <ChipGroup label="Equipment" options={options(EQUIPMENT, EQUIPMENT_LABELS)} value={form.equipment} onChange={(equipment) => update({ equipment })} hint="Leave empty if it needs nothing." />
      <MultiChipGroup label="Main muscles" options={options(MUSCLES, MUSCLE_LABELS)} values={form.primary} onToggle={(m) => setForm((f) => toggleMuscle(f, 'primary', m))} hint={`Up to ${MAX_PRIMARY}.`} error={errors.primary} />
      <MultiChipGroup label="Other muscles" options={options(MUSCLES, MUSCLE_LABELS)} values={form.secondary} onToggle={(m) => setForm((f) => toggleMuscle(f, 'secondary', m))} hint={`Optional, up to ${MAX_SECONDARY}.`} error={errors.secondary} />

      <View style={{ gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="What each set records">
        <AppText variant="label" color="text2">What each set records</AppText>
        {TRACKING.map((t) => (
          <OptionCard key={t} label={TRACKING_LABELS[t].label} description={TRACKING_LABELS[t].description} selected={form.tracking === t} onPress={() => update({ tracking: t })} />
        ))}
      </View>

      <TextField label="Steps" value={form.instructions} onChangeText={(text) => update({ instructions: text })} placeholder="One step per line" multiline maxLength={2000} error={errors.instructions} hint="Optional. One step per line." />

      {submitted && Object.keys(errors).length ? <AppText color="caution">Check the fields marked above.</AppText> : null}
      {problem ? <AppText color="caution">{problem}</AppText> : null}
      <Button label={saving ? 'Saving…' : 'Save exercise'} onPress={() => void submit()} disabled={saving} />
    </Screen>
  );
}
