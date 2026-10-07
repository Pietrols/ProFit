import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { config } from '@/config';
import { useAuth, useAuthStore } from '@/features/auth/AuthProvider';
import { googleSignInAvailable } from '@/features/auth/google';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { useAppTheme } from '@/theme/ThemeProvider';
import { fontFamilies, touchTarget } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { TextField } from '@/ui/TextField';

export default function SignInScreen() {
  const { colors, radius, space } = useAppTheme();
  const auth = useAuthStore();
  const snapshot = useAuth();
  const [busy, setBusy] = useState<'google' | 'dev' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState('');
  const notice = snapshot.status === 'signedOut' ? snapshot.notice : null;

  async function run(kind: 'google' | 'dev', action: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: space.lg, gap: space.xl, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
              <AppText accessibilityRole="header" style={{ fontFamily: fontFamilies.display, fontSize: 88, lineHeight: 84, letterSpacing: 1 }}>
                PRO<AppText style={{ fontFamily: fontFamilies.display, fontSize: 88, lineHeight: 84, color: colors.accent }}>FIT</AppText>
              </AppText>
            </View>
            <View style={{ width: 56, height: 4, borderRadius: radius.pill, backgroundColor: colors.accent2 }} />
            <AppText variant="body" color="text2" style={{ maxWidth: 340 }}>
              Plan your training, log every set and meal, keep your streak, and see what the rest of your gym is training.
            </AppText>
          </View>

          {notice ? (
            <Card style={{ borderColor: colors.caution }}>
              <AppText variant="bodyStrong">Signed out</AppText>
              <AppText color="text2">{notice}</AppText>
            </Card>
          ) : null}

          <View style={{ gap: space.md }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy !== null || !googleSignInAvailable }}
              disabled={busy !== null || !googleSignInAvailable}
              onPress={() => run('google', () => auth.signInWithGoogle())}
              style={({ pressed }) => ({
                minHeight: touchTarget + 8,
                borderRadius: radius.pill,
                backgroundColor: colors.text,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: space.sm,
                opacity: !googleSignInAvailable || busy !== null ? 0.5 : pressed ? 0.85 : 1,
              })}>
              <Ionicons name="logo-google" size={20} color={colors.bg} />
              <AppText variant="bodyStrong" style={{ color: colors.bg }}>
                {busy === 'google' ? 'Signing in…' : 'Continue with Google'}
              </AppText>
            </Pressable>
            {!googleSignInAvailable ? (
              <AppText variant="caption" color="text2">
                Google sign-in is not set up in this build yet. See docs/GOOGLE_SIGN_IN.md.
              </AppText>
            ) : null}
            {error ? (
              <AppText color="caution" accessibilityLiveRegion="polite">{error}</AppText>
            ) : null}
            <AppText variant="caption" color="text2">
              Your training is saved on this phone first and backed up to ProFit's server, so it works offline and follows you to a new phone.
            </AppText>
          </View>

          {config.devLogin ? (
            <Card>
              <AppText variant="label" color="text2">Developer sign-in</AppText>
              <AppText variant="caption" color="text2">Development builds only. Signs in any email without Google.</AppText>
              <TextField
                label="Email"
                value={devEmail}
                onChangeText={setDevEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                returnKeyType="go"
                onSubmitEditing={() => devEmail.trim() && run('dev', () => auth.signInForDevelopment(devEmail.trim()))}
              />
              <Button
                label={busy === 'dev' ? 'Signing in…' : 'Sign in'}
                variant="secondary"
                disabled={busy !== null || !devEmail.trim()}
                onPress={() => run('dev', () => auth.signInForDevelopment(devEmail.trim()))}
                style={{ alignSelf: 'flex-start' }}
              />
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function describe(error: unknown): string {
  if (error instanceof NetworkError) return "Can't reach ProFit right now. Check your connection and try again.";
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Sign-in failed. Try again.';
}
