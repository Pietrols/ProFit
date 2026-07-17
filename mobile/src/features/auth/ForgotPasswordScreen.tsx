// Password reset (AUDIT S3): email → 6-digit code + new password. The server
// answers identically whether the email exists, so the UI always advances.
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, ApiError, NetworkError } from '../../api/client';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Body,
  Button,
  ErrorBanner,
  KeyboardForm,
  Screen,
  TextField,
  Title,
} from '../../ui';
import { validateEmail } from './validate';

export function ForgotPasswordScreen({ onDone }: { onDone: () => void }) {
  const t = useAppTheme();
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function fail(e: unknown) {
    if (e instanceof ApiError && e.code === 'BAD_CODE') {
      setError('That code is invalid or has expired. Request a new one if needed.');
    } else if (e instanceof ApiError && e.code === 'RATE_LIMITED') {
      setError('Too many attempts — wait a few minutes and try again.');
    } else if (e instanceof NetworkError) {
      setError('Cannot reach the server. Check your connection.');
    } else {
      setError('Something went wrong. Please try again.');
    }
  }

  async function sendCode() {
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email.trim().toLowerCase());
      setStep('code');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function submitReset() {
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(email.trim().toLowerCase(), code.trim(), newPassword);
      setStep('done');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardForm>
        <Title>Reset password</Title>
        <AccentRule />
        {error ? <ErrorBanner message={error} /> : null}

        {step === 'email' ? (
          <>
            <View style={{ marginBottom: t.spacing.lg }}>
              <Body muted>
                Enter your account email and we&apos;ll send a 6-digit reset code.
              </Body>
            </View>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <Button label="Send reset code" onPress={sendCode} busy={busy} />
          </>
        ) : step === 'code' ? (
          <>
            <View style={{ marginBottom: t.spacing.lg }}>
              <Body muted>
                If an account exists for {email.trim()}, a code is on its way. It
                expires in 15 minutes.
              </Body>
            </View>
            <TextField
              label="6-digit code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            <TextField
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureToggle
              autoComplete="new-password"
            />
            <Button label="Reset password" onPress={submitReset} busy={busy} />
          </>
        ) : (
          <>
            <View style={{ marginBottom: t.spacing.lg }}>
              <Body>
                Password updated. You&apos;ve been signed out everywhere — log in
                with the new password.
              </Body>
            </View>
            <Button label="Back to log in" onPress={onDone} />
          </>
        )}

        {step !== 'done' ? (
          <Pressable onPress={onDone} style={{ marginTop: t.spacing.xl }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: t.typography.body, color: t.colors.tx2 }}>
                Back to log in
              </Text>
            </View>
          </Pressable>
        ) : null}
      </KeyboardForm>
    </Screen>
  );
}
