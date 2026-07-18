// Permanent account deletion (AUDIT S5). Two deliberate gates: an expand tap,
// then password re-entry — never a single-tap destructive action.
import React, { useState } from 'react';
import { View } from 'react-native';
import { api, ApiError, NetworkError } from '../../api/client';
import { getDb } from '../../data/db';
import { wipeAllLocalData } from '../../data/wipe';
import { useAppTheme } from '../../theme/ThemeContext';
import { Body, Button, ErrorBanner, Heading, TextField } from '../../ui';
import { useAuth } from '../auth/AuthContext';

export function DeleteAccountSection() {
  const t = useAppTheme();
  const { session, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!session || !password) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(session.token, password);
      await wipeAllLocalData(await getDb());
      await logout(); // clears the stored session; server token already dead
    } catch (e) {
      if (e instanceof ApiError && e.code === 'BAD_CREDENTIALS') {
        setError('Password is incorrect.');
      } else if (e instanceof NetworkError) {
        setError('Offline — deleting your account needs a connection.');
      } else {
        setError('Could not delete the account. Please try again.');
      }
      setBusy(false);
    }
  }

  return (
    <View>
      <Heading>Danger zone</Heading>
      <View style={{ marginTop: t.spacing.sm, gap: t.spacing.sm }}>
        {!open ? (
          <Button label="Delete account…" variant="ghost" onPress={() => setOpen(true)} />
        ) : (
          <>
            <Body muted>
              This permanently erases your account, workouts, logs, and any
              shared workouts — on our servers and on this device. It cannot be
              undone. Enter your password to confirm.
            </Body>
            {error ? <ErrorBanner message={error} /> : null}
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureToggle
              autoComplete="current-password"
            />
            <Button
              label="Permanently delete my account"
              variant="danger"
              onPress={confirmDelete}
              busy={busy}
              disabled={!password}
            />
            <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
          </>
        )}
      </View>
    </View>
  );
}
