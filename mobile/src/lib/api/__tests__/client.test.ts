import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../../features/auth/session';
import { createApiClient } from '../client';
import { ApiError, NetworkError } from '../errors';

const NOW = Date.parse('2026-10-07T10:00:00Z');
const inMinutes = (m: number) => new Date(NOW + m * 60_000).toISOString();

const freshSession: Session = { accessToken: 'access-1', accessTokenExpiresAt: inMinutes(15), refreshToken: 'refresh-1' };
const nextSession: Session = { accessToken: 'access-2', accessTokenExpiresAt: inMinutes(30), refreshToken: 'refresh-2' };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const apiError = (status: number, code: string, message = code) => json(status, { error: { code, message } });

type Call = { url: string; method: string; auth: string | null; body: unknown };

// A fake fetch that answers from a list of handlers and records what was sent.
function fakeFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = {
      url: String(url),
      method: init?.method ?? 'GET',
      auth: headers.Authorization ?? null,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return handler(call);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function setup(handler: (call: Call) => Response | Promise<Response>, start: Session | null = freshSession) {
  let session = start;
  const saved: Session[] = [];
  const expired = vi.fn();
  const { fn, calls } = fakeFetch(handler);
  const client = createApiClient({
    baseUrl: 'http://api.test',
    fetch: fn,
    now: () => NOW,
    getSession: () => session,
    saveSession: async (s) => {
      saved.push(s);
      session = s;
    },
    onSessionExpired: expired,
  });
  return { client, calls, saved, expired, current: () => session };
}

describe('createApiClient', () => {
  it('sends the access token and parses the reply', async () => {
    const { client, calls } = setup(() => json(200, { ok: true }));
    await expect(client.get('/me')).resolves.toEqual({ ok: true });
    expect(calls).toEqual([{ url: 'http://api.test/me', method: 'GET', auth: 'Bearer access-1', body: undefined }]);
  });

  it('sends no token on public calls', async () => {
    const { client, calls } = setup(() => json(200, { session: freshSession }), null);
    await client.post('/auth/dev', { email: 'a@b.co' }, { auth: false });
    expect(calls[0]).toMatchObject({ auth: null, body: { email: 'a@b.co' } });
  });

  it('refreshes before the request when the access token is about to expire', async () => {
    const nearlyExpired = { ...freshSession, accessTokenExpiresAt: inMinutes(0.5) };
    const { client, calls, saved } = setup((call) => (call.url.endsWith('/auth/refresh') ? json(200, { session: nextSession }) : json(200, {})), nearlyExpired);
    await client.get('/me');
    expect(calls.map((c) => c.url)).toEqual(['http://api.test/auth/refresh', 'http://api.test/me']);
    expect(calls[0]!.body).toEqual({ refreshToken: 'refresh-1' });
    expect(calls[1]!.auth).toBe('Bearer access-2');
    expect(saved).toEqual([nextSession]);
  });

  it('refreshes and retries once when the API says the token expired', async () => {
    let meCalls = 0;
    const { client, calls } = setup((call) => {
      if (call.url.endsWith('/auth/refresh')) return json(200, { session: nextSession });
      meCalls += 1;
      return meCalls === 1 ? apiError(401, 'TOKEN_EXPIRED') : json(200, { ok: true });
    });
    await expect(client.get('/me')).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c.auth)).toEqual(['Bearer access-1', null, 'Bearer access-2']);
  });

  it('does not refresh for other 401 errors', async () => {
    const { client, calls } = setup(() => apiError(401, 'UNAUTHENTICATED'));
    await expect(client.get('/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(calls).toHaveLength(1);
  });

  it('shares one refresh between requests that need it at the same time', async () => {
    const nearlyExpired = { ...freshSession, accessTokenExpiresAt: inMinutes(0) };
    const { client, calls } = setup((call) => (call.url.endsWith('/auth/refresh') ? json(200, { session: nextSession }) : json(200, {})), nearlyExpired);
    await Promise.all([client.get('/me'), client.get('/me'), client.get('/me')]);
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('reports an ended sign-in when the refresh token is refused', async () => {
    const nearlyExpired = { ...freshSession, accessTokenExpiresAt: inMinutes(0) };
    const { client, expired, saved } = setup(() => apiError(401, 'SESSION_EXPIRED', 'Your session has ended.'), nearlyExpired);
    await expect(client.get('/me')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(expired).toHaveBeenCalledOnce();
    expect(saved).toEqual([]);
  });

  it('keeps the session when the refresh fails for lack of a connection', async () => {
    const nearlyExpired = { ...freshSession, accessTokenExpiresAt: inMinutes(0) };
    const { client, expired, current } = setup(() => {
      throw new TypeError('Network request failed');
    }, nearlyExpired);
    await expect(client.get('/me')).rejects.toBeInstanceOf(NetworkError);
    expect(expired).not.toHaveBeenCalled();
    expect(current()).toBe(nearlyExpired);
  });

  it('turns API error bodies into ApiError with their code and message', async () => {
    const { client } = setup(() => apiError(400, 'VALIDATION_FAILED', 'birthYear: must be 2013 or earlier'));
    const error = await client.patch('/me', { birthYear: 2020 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', message: 'birthYear: must be 2013 or earlier' });
  });

  it('copes with error replies that are not JSON', async () => {
    const { client } = setup(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(client.get('/me')).rejects.toMatchObject({ status: 502, code: 'HTTP_502' });
  });

  it('refuses authenticated calls when signed out', async () => {
    const { client, calls } = setup(() => json(200, {}), null);
    await expect(client.get('/me')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(calls).toHaveLength(0);
  });

  it('returns nothing for 204 replies', async () => {
    const { client } = setup(() => new Response(null, { status: 204 }));
    await expect(client.post('/auth/sign-out', { refreshToken: 'refresh-1' }, { auth: false })).resolves.toBeUndefined();
  });

  it('gives a clear error when no server address is set', async () => {
    const client = createApiClient({ baseUrl: '', getSession: () => null, saveSession: async () => {}, onSessionExpired: () => {} });
    await expect(client.post('/auth/dev', {}, { auth: false })).rejects.toThrow(/EXPO_PUBLIC_API_URL/);
  });
});

describe('auth headers for native transfers', () => {
  it('gives the current token while it is fresh', async () => {
    const { client, calls } = setup(() => json(500, {}));
    await expect(client.authHeaders()).resolves.toEqual({ Authorization: 'Bearer access-1' });
    expect(calls).toEqual([]);
    expect(client.url('/media/x')).toBe('http://api.test/media/x');
  });

  it('refreshes first when the token is about to run out, or when asked to', async () => {
    const { client, saved } = setup(() => json(200, { session: nextSession }), { ...freshSession, accessTokenExpiresAt: inMinutes(0.5) });
    await expect(client.authHeaders()).resolves.toEqual({ Authorization: 'Bearer access-2' });
    const second = setup(() => json(200, { session: nextSession }));
    await expect(second.client.authHeaders({ refresh: true })).resolves.toEqual({ Authorization: 'Bearer access-2' });
    expect(saved).toEqual([nextSession]);
  });

  it('refuses when signed out', async () => {
    const { client } = setup(() => json(500, {}), null);
    await expect(client.authHeaders()).rejects.toBeInstanceOf(ApiError);
  });
});
