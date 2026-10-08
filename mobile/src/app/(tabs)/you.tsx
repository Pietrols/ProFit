import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAuthStore, useMe } from '@/features/auth/AuthProvider';
import { EXPERIENCE_OPTIONS, GOAL_OPTIONS, PLACE_OPTIONS, labelFor } from '@/features/profile/labels';
import type { ThemePreference } from '@/theme/preference';
import { useAppTheme } from '@/theme/ThemeProvider';
import { fontFamilies, touchTarget } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Follow phone' },
];

export default function YouScreen() {
  const { colors, radius, space, preference, setPreference } = useAppTheme();

  return (
    <Screen title="You">
      <AccountCard />

      <Card>
        <AppText variant="label" color="text2">Appearance</AppText>
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.pill, padding: space.xs }}>
          {THEME_OPTIONS.map((option) => {
            const selected = option.value === preference;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setPreference(option.value)}
                style={{
                  flex: 1,
                  minHeight: touchTarget - space.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.pill,
                  backgroundColor: selected ? colors.accent : 'transparent',
                }}>
                <AppText variant="bodyStrong" style={{ color: selected ? colors.onAccent : colors.text }}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <SignOutCard />
    </Screen>
  );
}

function AccountCard() {
  const { colors, space } = useAppTheme();
  const { me, hasPendingChanges, syncError } = useMe();
  if (!me) {
    return (
      <Card>
        <AppText variant="label" color="text2">Account</AppText>
        <AppText color="text2">Your profile has not reached this phone yet. It will appear once you are online.</AppText>
      </Card>
    );
  }
  const { user, profile } = me;
  const summary = [labelFor(GOAL_OPTIONS, profile.goal), labelFor(EXPERIENCE_OPTIONS, profile.experience), labelFor(PLACE_OPTIONS, profile.trainingPlace)].filter(Boolean);

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar name={user.displayName} url={user.avatarUrl} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title" numberOfLines={1}>{user.displayName}</AppText>
          <AppText variant="caption" color="text2" numberOfLines={1}>{user.email}</AppText>
        </View>
      </View>
      {summary.length ? (
        <AppText color="text2">{summary.join('  ·  ')}</AppText>
      ) : (
        <AppText color="text2">Add your goal and experience so plans and tips fit you.</AppText>
      )}
      {hasPendingChanges ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.caution }} />
          <AppText variant="caption" color="text2">Saved on this phone. Syncs when you are online.</AppText>
        </View>
      ) : null}
      {syncError ? <AppText variant="caption" color="caution">{syncError}</AppText> : null}
      <Button label="Edit profile" variant="secondary" onPress={() => router.push('/profile')} style={{ alignSelf: 'flex-start', marginTop: space.xs }} />
    </Card>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const { colors } = useAppTheme();
  const size = 56;
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityLabel={`${name}'s photo`} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent2, alignItems: 'center', justifyContent: 'center' }}>
      <AppText style={{ fontFamily: fontFamilies.display, fontSize: 28, lineHeight: 30, color: colors.onAccent2 }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </AppText>
    </View>
  );
}

function SignOutCard() {
  const { space } = useAppTheme();
  const auth = useAuthStore();
  const { hasPendingChanges } = useMe();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await auth.signOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <AppText variant="label" color="text2">Account</AppText>
      {confirming ? (
        <>
          <AppText variant="bodyStrong">Sign out of ProFit on this phone?</AppText>
          <AppText color="text2">
            {hasPendingChanges
              ? 'Some changes have not synced yet. They stay on this phone and are sent the next time you sign in here.'
              : 'Everything is backed up. Sign in again any time to pick up where you left off.'}
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Button label={busy ? 'Signing out…' : 'Sign out'} onPress={signOut} disabled={busy} />
            <Button label="Cancel" variant="secondary" onPress={() => setConfirming(false)} disabled={busy} />
          </View>
        </>
      ) : (
        <Button label="Sign out" variant="secondary" onPress={() => setConfirming(true)} style={{ alignSelf: 'flex-start' }} />
      )}
    </Card>
  );
}
