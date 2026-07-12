import React from 'react';
import { AccentRule, EmptyView, Screen, Title } from '../../ui';
import { useUser } from '../auth/AuthContext';

export function HomeScreen() {
  const user = useUser();
  return (
    <Screen>
      <Title>Hey, {user.displayName}</Title>
      <AccentRule />
      <EmptyView
        title="No plan yet"
        hint="The Plan Builder lands in Phase 3 — your weekly plan will live here."
      />
    </Screen>
  );
}
