import type { Session } from '../../features/auth/session';
import { needsRefresh } from '../../features/auth/session';
import { singleFlight } from '../singleFlight';
import { ApiError, NetworkError, errorFromResponse } from './errors';

// Talks to the ProFit API. Adds the access token, refreshes it when it is about to run out or the
// API says it has, and turns failures into ApiError or NetworkError.
// No React Native imports, so it is tested in plain Node with a fake fetch.

type Options = {
  baseUrl: string;
  // The session currently held by the app, or null when signed out.
  getSession: () => Session | null;
  // Called with every new pair of tokens. Must persist them before resolving: once the API has
  // rotated the refresh token, the old one is spent.
  saveSession: (session: Session) => Promise<void>;
  // The API refused the refresh token: the sign-in has ended and the user must sign in again.
  onSessionExpired: () => void;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

type RequestOptions = { body?: unknown; auth?: boolean };

export type ApiClient = {
  request: <T>(method: string, path: string, options?: RequestOptions) => Promise<T>;
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown, options?: { auth?: boolean }) => Promise<T>;
  patch: <T>(path: string, body: unknown) => Promise<T>;
};

const DEFAULT_TIMEOUT_MS = 15_000;

export function createApiClient(options: Options): ApiClient {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function send(method: string, path: string, body: unknown, accessToken: string | null): Promise<Response> {
    if (!options.baseUrl) throw new NetworkError('The app has no server address. Set EXPO_PUBLIC_API_URL in mobile/.env.');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await doFetch(options.baseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      // fetch only rejects when no answer came back: offline, server unreachable, or our timeout.
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  }

  async function readBody<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  // One refresh at a time, shared by every request that needs it (see singleFlight).
  const refresh = singleFlight(async (): Promise<Session> => {
    const current = options.getSession();
    if (!current) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const response = await send('POST', '/auth/refresh', { refreshToken: current.refreshToken }, null);
    if (!response.ok) {
      const error = await errorFromResponse(response);
      if (response.status === 401) options.onSessionExpired();
      throw error;
    }
    const { session } = await readBody<{ session: Session }>(response);
    await options.saveSession(session);
    return session;
  });

  async function request<T>(method: string, path: string, { body, auth = true }: RequestOptions = {}): Promise<T> {
    if (!auth) {
      const response = await send(method, path, body, null);
      if (!response.ok) throw await errorFromResponse(response);
      return readBody<T>(response);
    }

    let session = options.getSession();
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    if (needsRefresh(session, now())) session = await refresh();

    let response = await send(method, path, body, session.accessToken);
    // The token can still expire between the check above and the server reading it (a slow
    // network, a phone clock that is off). The API says so with TOKEN_EXPIRED: refresh once, retry.
    if (response.status === 401) {
      const error = await errorFromResponse(response);
      if (error.code !== 'TOKEN_EXPIRED') throw error;
      session = await refresh();
      response = await send(method, path, body, session.accessToken);
    }
    if (!response.ok) throw await errorFromResponse(response);
    return readBody<T>(response);
  }

  return {
    request,
    get: (path) => request('GET', path),
    post: (path, body, opts) => request('POST', path, { body, auth: opts?.auth }),
    patch: (path, body) => request('PATCH', path, { body }),
  };
}
