import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ApiError, NetworkError } from '../../api/client';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Button,
  ErrorBanner,
  KeyboardForm,
  Screen,
  TextField,
  Title,
} from '../../ui';
import { useAuth } from './AuthContext';
import { validateEmail } from './validate';

export function LoginScreen({ onRegister }: { onRegister: () => void }) {
  const t = useAppTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const errs = {
      email: validateEmail(email),
      password: password ? undefined : 'Password is required',
    };
    setFieldErrors(errs);
    if (errs.email || errs.password) return;

    setBusy(true);
    setError(null);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'BAD_CREDENTIALS') {
        setError('Wrong email or password.');
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
      <KeyboardForm>
        <Title>ProFit</Title>
        <AccentRule />
        {error ? <ErrorBanner message={error} /> : null}
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
          secureToggle
          autoComplete="password"
        />
        <Button label="Log in" onPress={submit} busy={busy} />
        <Pressable onPress={onRegister} style={{ marginTop: t.spacing.xl }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: t.typography.body, color: t.colors.tx2 }}>
              New here?{' '}
              <Text style={{ color: t.colors.green, fontFamily: t.typography.label }}>
                Create an account
              </Text>
            </Text>
          </View>
        </Pressable>
      </KeyboardForm>
    </Screen>
  );
}
