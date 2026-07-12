import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { ApiError, NetworkError } from '../../api/client';
import { useAppTheme } from '../../theme/ThemeContext';
import { AccentRule, Button, ErrorBanner, Screen, TextField, Title } from '../../ui';
import { useAuth } from './AuthContext';
import { validateDisplayName, validateEmail, validatePassword } from './validate';

export function RegisterScreen({ onLogin }: { onLogin: () => void }) {
  const t = useAppTheme();
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string;
    email?: string;
    password?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const errs = {
      displayName: validateDisplayName(displayName),
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setFieldErrors(errs);
    if (errs.displayName || errs.email || errs.password) return;

    setBusy(true);
    setError(null);
    try {
      await register(email.trim().toLowerCase(), password, displayName.trim());
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_TAKEN') {
        setError('That email is already registered. Try logging in instead.');
      } else if (e instanceof NetworkError) {
        setError('Cannot reach the server. Check your connection and try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center' }}
      >
        <Title>Join ProFit</Title>
        <AccentRule />
        {error ? <ErrorBanner message={error} /> : null}
        <TextField
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          error={fieldErrors.displayName}
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
          secureTextEntry
          autoComplete="new-password"
        />
        <Button label="Create account" onPress={submit} busy={busy} />
        <Pressable onPress={onLogin} style={{ marginTop: t.spacing.xl }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: t.typography.body, color: t.colors.tx2 }}>
              Already have an account?{' '}
              <Text style={{ color: t.colors.green, fontFamily: t.typography.label }}>
                Log in
              </Text>
            </Text>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}
