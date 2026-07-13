import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { api, ApiError, NetworkError } from '../../api/client';
import { Exercise } from '../../data/types';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Body,
  Button,
  ErrorBanner,
  Heading,
  KeyboardForm,
  Screen,
  Title,
} from '../../ui';
import { useAuth, useUser } from '../auth/AuthContext';
import { CommunityStackParamList } from './CommunityStack';
import { ExercisePickerModal } from './ExercisePickerModal';
import { pickImageAsDataUri } from './pickImage';

interface DraftEx {
  key: string;
  exerciseId: string;
  name: string;
  sets: string;
  reps: string;
  rest: string;
}

export function CreateWorkoutScreen() {
  const t = useAppTheme();
  const user = useUser();
  const { session } = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();

  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [cover, setCover] = useState<string | null>(null);
  const [exercises, setExercises] = useState<DraftEx[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageNote, setImageNote] = useState<string | null>(null);

  function addExercise(ex: Exercise) {
    setExercises((xs) => [
      ...xs,
      {
        key: `${ex.id}-${xs.length}`,
        exerciseId: ex.id,
        name: ex.name,
        sets: '3',
        reps: '8-12',
        rest: '90',
      },
    ]);
    setPickerOpen(false);
  }
  function patch(key: string, p: Partial<DraftEx>) {
    setExercises((xs) => xs.map((e) => (e.key === key ? { ...e, ...p } : e)));
  }

  async function chooseImage() {
    setImageNote(null);
    const r = await pickImageAsDataUri([16, 9]);
    if (r.ok) setCover(r.dataUri);
    else if (r.reason === 'denied')
      setImageNote('Photo access is blocked — allow it in system settings.');
    else if (r.reason === 'too_large')
      setImageNote('That image is too large — pick a smaller one.');
  }

  async function suggestImage() {
    if (!session) return;
    setImageNote(null);
    try {
      const res = await api.suggestWorkoutImage(session.token, name || 'workout');
      // Never blocks saving: on this stack image generation is unavailable, so
      // we just surface the reason and let the user save with no cover.
      setImageNote(res.available ? null : res.reason);
      if (res.available && res.imageUrl) setCover(res.imageUrl);
    } catch {
      setImageNote('Could not reach the image service.');
    }
  }

  async function save() {
    if (!name.trim()) return setError('Give your workout a name.');
    if (exercises.length === 0) return setError('Add at least one exercise.');
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await api.createWorkout(session.token, {
        name: name.trim(),
        isPublic,
        coverImage: cover, // may be null — saving is never blocked on an image
        exercises: exercises.map((e) => ({
          exerciseId: e.exerciseId,
          sets: Number(e.sets) || 1,
          reps: e.reps.trim() || '1',
          restSeconds: Number(e.rest) || 0,
          durationSeconds: null,
        })),
      });
      nav.goBack();
    } catch (e) {
      setError(
        e instanceof NetworkError
          ? 'Creating a workout needs a connection.'
          : e instanceof ApiError
            ? e.message
            : 'Could not save. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const numInput = (value: string, onChange: (v: string) => void, w = 48) => (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType="numeric"
      placeholderTextColor={t.colors.tx3}
      style={{
        width: w,
        fontFamily: t.typography.body,
        fontSize: 14,
        color: t.colors.tx,
        backgroundColor: t.colors.s2,
        borderRadius: t.radius.sm,
        paddingHorizontal: t.spacing.sm,
        paddingVertical: 6,
        textAlign: 'center',
      }}
    />
  );

  return (
    <Screen>
      <KeyboardForm centered={false}>
        <Title>Create workout</Title>
        <AccentRule />
        {error ? <ErrorBanner message={error} /> : null}

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Workout name"
          placeholderTextColor={t.colors.tx3}
          style={{
            fontFamily: t.typography.heading,
            fontSize: 20,
            color: t.colors.tx,
            backgroundColor: t.colors.s1,
            borderRadius: t.radius.md,
            paddingHorizontal: t.spacing.md,
            paddingVertical: t.spacing.sm,
            marginBottom: t.spacing.md,
          }}
        />

        {/* Cover image (optional) */}
        <View style={{ backgroundColor: t.colors.s1, borderRadius: t.radius.lg, padding: t.spacing.lg, marginBottom: t.spacing.md }}>
          <Heading>Cover image</Heading>
          {cover ? (
            <Image
              source={{ uri: cover }}
              style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: t.radius.md, marginTop: t.spacing.md }}
              contentFit="cover"
            />
          ) : (
            <Body muted>Optional — a workout saves fine without one.</Body>
          )}
          <View style={{ flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.md, flexWrap: 'wrap' }}>
            <Button label="Add from device" variant="ghost" onPress={chooseImage} />
            <Button label="Suggest with AI" variant="ghost" onPress={suggestImage} />
            {cover ? <Button label="Remove" variant="danger" onPress={() => setCover(null)} /> : null}
          </View>
          {imageNote ? (
            <Text style={{ fontFamily: t.typography.body, fontSize: 12, color: t.colors.tx3, marginTop: t.spacing.sm }}>
              {imageNote}
            </Text>
          ) : null}
        </View>

        {/* Exercises */}
        <View style={{ backgroundColor: t.colors.s1, borderRadius: t.radius.lg, padding: t.spacing.lg, marginBottom: t.spacing.md }}>
          <Heading>Exercises</Heading>
          {exercises.map((e) => (
            <View key={e.key} style={{ marginTop: t.spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: t.typography.label, fontSize: 14, color: t.colors.tx, flexShrink: 1 }} numberOfLines={1}>
                  {e.name}
                </Text>
                <Pressable onPress={() => setExercises((xs) => xs.filter((x) => x.key !== e.key))} hitSlop={8}>
                  <Text style={{ color: t.colors.red, fontFamily: t.typography.body, fontSize: 12 }}>✕</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, marginTop: t.spacing.xs, flexWrap: 'wrap' }}>
                {numInput(e.sets, (v) => patch(e.key, { sets: v }), 44)}
                <Text style={{ color: t.colors.tx3, fontFamily: t.typography.body, fontSize: 12 }}>×</Text>
                <TextInput
                  value={e.reps}
                  onChangeText={(v) => patch(e.key, { reps: v })}
                  placeholder="reps"
                  placeholderTextColor={t.colors.tx3}
                  style={{
                    width: 72,
                    fontFamily: t.typography.body,
                    fontSize: 14,
                    color: t.colors.tx,
                    backgroundColor: t.colors.s2,
                    borderRadius: t.radius.sm,
                    paddingHorizontal: t.spacing.sm,
                    paddingVertical: 6,
                    textAlign: 'center',
                  }}
                />
                <Text style={{ color: t.colors.tx3, fontFamily: t.typography.body, fontSize: 12 }}>rest</Text>
                {numInput(e.rest, (v) => patch(e.key, { rest: v }), 48)}
              </View>
            </View>
          ))}
          <View style={{ marginTop: t.spacing.md }}>
            <Button label="Add exercise" variant="ghost" onPress={() => setPickerOpen(true)} />
          </View>
        </View>

        {/* Public toggle */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: t.spacing.md }}>
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontFamily: t.typography.label, fontSize: 14, color: t.colors.tx }}>
              Share publicly
            </Text>
            <Body muted>Anyone can find and copy it in the community library.</Body>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ true: t.colors.green, false: t.colors.line2 }}
          />
        </View>

        <Button label="Save workout" onPress={save} busy={busy} />
        <View style={{ height: t.spacing.xxl }} />
      </KeyboardForm>

      <ExercisePickerModal
        visible={pickerOpen}
        homeOnly={user.defaultContext === 'home'}
        onPick={addExercise}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}
