// Email confirmation prompt (AUDIT S3). Rendered only while unverified;
// verification is advisory — nothing is locked behind it yet (see DECISIONS).
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, ApiError, NetworkError } from '../../api/client';
import { useAppTheme } from '../../theme/ThemeContext';
import { Body, Button, TextField } from '../../ui';
import { useAuth, useUser } from '../auth/AuthContext';

export function VerifyEmailSection() {
  const t = useAppTheme();
  const user = useUser();
  const { refreshProfile } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (user.emailVerifiedAt) return null;

  async function verify() {
    if (!/^\d{6}$/.test(code.trim())) {
      setNote('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await api.verifyEmail(user.email, code.trim());
      await refreshProfile();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'BAD_CODE') {
        setNote('That code is invalid or has expired — try resending.');
      } else if (e instanceof NetworkError) {
        setNote('Offline — verifying needs a connection.');
      } else {
        setNote('Could not verify. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setNote(null);
    try {
      await api.resendVerification(user.email);
      setNote('A fresh code is on its way.');
    } catch {
      setNote('Could not resend right now — try again in a bit.');
    }
  }

  return (
    <View
      style={{
        backgroundColor: t.colors.bdim,
        borderRadius: t.radius.md,
        padding: t.spacing.md,
        marginBottom: t.spacing.xl,
      }}
    >
      <Body>Confirm your email — we sent a 6-digit code to {user.email}.</Body>
      <View style={{ marginTop: t.spacing.md }}>
        <TextField
          label="Confirmation code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
        />
      </View>
      <Button label="Confirm email" onPress={verify} busy={busy} />
      <Pressable onPress={resend} style={{ marginTop: t.spacing.sm }}>
        <Text style={{ fontFamily: t.typography.label, fontSize: 13, color: t.colors.blue }}>
          RESEND CODE
        </Text>
      </Pressable>
      {note ? (
        <Text
          style={{
            fontFamily: t.typography.body,
            fontSize: 13,
            color: t.colors.tx2,
            marginTop: t.spacing.sm,
          }}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}
