import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { NetworkError } from '../../api/client';
import { useAppTheme } from '../../theme/ThemeContext';
import { Body, Button, Heading } from '../../ui';
import { useAuth, useUser } from '../auth/AuthContext';
import { pickImageAsDataUri } from '../community/pickImage';

/**
 * Public profile editor (Group G): avatar + short bio. These are shown to
 * others ONLY where the user has shared a public workout (Community); a user
 * who shares nothing stays undiscoverable — so this is framed as "public".
 */
export function PublicProfileSection() {
  const t = useAppTheme();
  const user = useUser();
  const { updateProfile } = useAuth();
  const [avatar, setAvatar] = useState<string | null>(user.avatar ?? null);
  const [bio, setBio] = useState(user.publicBio ?? '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const dirty = avatar !== (user.avatar ?? null) || bio !== (user.publicBio ?? '');

  async function choose() {
    setNote(null);
    const r = await pickImageAsDataUri([1, 1]);
    if (r.ok) setAvatar(r.dataUri);
    else if (r.reason === 'denied') setNote('Photo access is blocked — allow it in settings.');
    else if (r.reason === 'too_large') setNote('That image is too large — pick a smaller one.');
  }

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      await updateProfile({ avatar, publicBio: bio.trim() || null });
      setNote('Public profile saved.');
    } catch (e) {
      setNote(
        e instanceof NetworkError
          ? 'Offline — try again when connected.'
          : 'Could not save your profile.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Heading>Public profile</Heading>
      <Body muted>Shown to others only on workouts you share publicly.</Body>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, marginTop: t.spacing.md }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: t.colors.s3,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {avatar ? (
            <Image source={{ uri: avatar }} style={{ width: 72, height: 72 }} contentFit="cover" />
          ) : (
            <Text style={{ fontFamily: t.typography.display, fontSize: 26, color: t.colors.tx3 }}>
              {user.displayName.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={{ gap: t.spacing.xs }}>
          <Button label="Change photo" variant="ghost" onPress={choose} />
          {avatar ? <Button label="Remove" variant="danger" onPress={() => setAvatar(null)} /> : null}
        </View>
      </View>

      <TextInput
        value={bio}
        onChangeText={setBio}
        placeholder="A line about your goals (public)"
        placeholderTextColor={t.colors.tx3}
        multiline
        maxLength={280}
        style={{
          fontFamily: t.typography.body,
          fontSize: 15,
          color: t.colors.tx,
          backgroundColor: t.colors.s1,
          borderColor: t.colors.line2,
          borderWidth: 1,
          borderRadius: t.radius.md,
          paddingHorizontal: t.spacing.md,
          paddingVertical: t.spacing.sm,
          marginTop: t.spacing.md,
          minHeight: 64,
        }}
      />

      <View style={{ height: t.spacing.sm }} />
      <Button label="Save public profile" variant="ghost" onPress={save} busy={busy} disabled={!dirty} />
      {note ? (
        <Text style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.tx2, marginTop: t.spacing.xs }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}
