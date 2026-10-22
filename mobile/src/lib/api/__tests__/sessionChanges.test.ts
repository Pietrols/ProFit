import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../../features/auth/session';
import { createApiClient } from '../client';

const now = Date.parse('2026-10-22T10:00:00Z');
const session = (name: string, expired = false): Session => ({
  accessToken: name,
  refreshToken: `refresh-${name}`,
  accessTokenExpiresAt: new Date(now + (expired ? -1 : 900000)).toISOString(),
});
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('API session changes during requests', () => {
  it.each(['success', 'refused', 'native headers'])(
    'does not replace or expire a newer sign-in after an old refresh: %s',
    async (outcome) => {
      let current = session('first', true);
      const started = deferred<void>();
      const gate = deferred<Response>();
      const saved = vi.fn(async (value: Session) => {
        current = value;
      });
      const expired = vi.fn();
      const fetcher = vi.fn(async () => {
        started.resolve();
        return gate.promise;
      });
      const api = createApiClient({
        baseUrl: 'http://api.test',
        now: () => now,
        getSession: () => current,
        saveSession: saved,
        onSessionExpired: expired,
        fetch: fetcher,
      });
      const pending = (outcome === 'native headers' ? api.authHeaders() : api.get('/me')).catch(
        (error: unknown) => error,
      );
      await started.promise;
      const newer = session('new-sign-in');
      current = newer;
      gate.resolve(
        outcome === 'refused'
          ? reply(401, { error: { code: 'SESSION_EXPIRED', message: 'Expired' } })
          : reply(200, { session: session('late-first') }),
      );
      expect(await pending).toMatchObject({ code: 'SESSION_CHANGED' });
      expect(saved).not.toHaveBeenCalled();
      expect(expired).not.toHaveBeenCalled();
      expect(current).toBe(newer);
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );

  it.each([200, 401])(
    'discards an old HTTP %i response without retrying as the new account',
    async (status) => {
      let current = session('first');
      const started = deferred<void>();
      const gate = deferred<Response>();
      const calls: string[] = [];
      const api = createApiClient({
        baseUrl: 'http://api.test',
        now: () => now,
        getSession: () => current,
        saveSession: async (value) => {
          current = value;
        },
        onSessionExpired: vi.fn(),
        fetch: async (url) => {
          calls.push(String(url));
          started.resolve();
          return gate.promise;
        },
      });
      const pending = api.get('/me').catch((error: unknown) => error);
      await started.promise;
      current = session('new-sign-in');
      gate.resolve(
        status === 200
          ? reply(200, { private: 'first account' })
          : reply(401, { error: { code: 'TOKEN_EXPIRED', message: 'Expired' } }),
      );
      expect(await pending).toMatchObject({ code: 'SESSION_CHANGED' });
      expect(calls).toEqual(['http://api.test/me']);
      expect(current.accessToken).toBe('new-sign-in');
    },
  );

  it('refreshes a new sign-in independently of a pending old refresh', async () => {
    let current = session('first', true);
    const started = deferred<void>();
    const gate = deferred<Response>();
    const refreshes: string[] = [];
    const api = createApiClient({
      baseUrl: 'http://api.test',
      now: () => now,
      getSession: () => current,
      saveSession: async (value) => {
        current = value;
      },
      onSessionExpired: vi.fn(),
      fetch: async (url, init) => {
        if (!String(url).endsWith('/auth/refresh'))
          return reply(200, { account: current.accessToken });
        const token = JSON.parse(String(init?.body)).refreshToken;
        refreshes.push(token);
        if (token === 'refresh-first') {
          started.resolve();
          return gate.promise;
        }
        return reply(200, { session: session('new-refreshed') });
      },
    });
    const first = api.get('/me').catch((error: unknown) => error);
    await started.promise;
    current = session('new-sign-in', true);
    const next = api.get('/me').catch((error: unknown) => error);
    gate.resolve(reply(200, { session: session('late-first') }));
    expect(await first).toMatchObject({ code: 'SESSION_CHANGED' });
    expect(await next).toEqual({ account: 'new-refreshed' });
    expect(refreshes).toEqual(['refresh-first', 'refresh-new-sign-in']);
  });
});
