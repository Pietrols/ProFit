import * as SecureStore from 'expo-secure-store';
import { User } from '../../api/types';

export interface Session {
  token: string;
  user: User;
}

const KEY = 'profit.session';

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    return parsed.token && parsed.user ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
