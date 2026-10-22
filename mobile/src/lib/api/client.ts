import type { Session } from '../../features/auth/session';
import { needsRefresh } from '../../features/auth/session';
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
  // Capture before asynchronous local reads or native transfers; call at each continuation.
  captureSession: () => () => void;
  request: <T>(method: string, path: string, options?: RequestOptions) => Promise<T>;
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown, options?: { auth?: boolean }) => Promise<T>;
  patch: <T>(path: string, body: unknown) => Promise<T>;
  // For transfers that do not go through fetch (photo uploads and downloads run natively).
  // The full address of an API path:
  url: (path: string) => string;
  // The Authorization header, refreshing the token first when it is about to run out, or always
  // when refresh is true (the API answered TOKEN_EXPIRED to the last try).
  authHeaders: (options?: { refresh?: boolean }) => Promise<Record<string, string>>;
};

const DEFAULT_TIMEOUT_MS = 15_000;

export function createApiClient(options: Options): ApiClient {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const scopes = new Map<string, object>();
  const refreshing = new WeakMap<object, Promise<Session>>();
  function currentScope(): object | null {
    const session = options.getSession();
    if (!session) return null;
    let scope = scopes.get(session.refreshToken);
    if (!scope) {
      scope = {};
      scopes.set(session.refreshToken, scope);
    }
    return scope;
  }
  function checkScope(scope: object | null) {
    if (!scope || currentScope() !== scope)
      throw new ApiError(401, 'SESSION_CHANGED', 'Your sign-in changed. Try again.');
  }
  function captureSession() {
    const scope = currentScope();
    checkScope(scope);
    return () => checkScope(scope);
  }

  async function send(
    method: string,
    path: string,
    body: unknown,
    accessToken: string | null,
  ): Promise<Response> {
    if (!options.baseUrl)
      throw new NetworkError(
        'The app has no server address. Set EXPO_PUBLIC_API_URL in mobile/.env.',
      );
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

  // Share rotations only within one sign-in. A newer sign-in never joins an old refresh.
  function refresh(scope: object | null): Promise<Session> {
    checkScope(scope);
    const pending = refreshing.get(scope!);
    if (pending) return pending;
    const result = rotate(scope!).finally(() => refreshing.delete(scope!));
    refreshing.set(scope!, result);
    return result;
  }
  async function rotate(scope: object): Promise<Session> {
    const current = options.getSession();
    if (!current) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const response = await send(
      'POST',
      '/auth/refresh',
      { refreshToken: current.refreshToken },
      null,
    );
    checkScope(scope);
    if (!response.ok) {
      const error = await errorFromResponse(response);
      checkScope(scope);
      if (response.status === 401) options.onSessionExpired();
      throw error;
    }
    const { session } = await readBody<{ session: Session }>(response);
    checkScope(scope);
    scopes.set(session.refreshToken, scope);
    await options.saveSession(session);
    checkScope(scope);
    if (session.refreshToken !== current.refreshToken) scopes.delete(current.refreshToken);
    return session;
  }

  async function request<T>(
    method: string,
    path: string,
    { body, auth = true }: RequestOptions = {},
  ): Promise<T> {
    if (!auth) {
      const response = await send(method, path, body, null);
      if (!response.ok) throw await errorFromResponse(response);
      return readBody<T>(response);
    }

    let session = options.getSession();
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const scope = currentScope();
    if (needsRefresh(session, now())) session = await refresh(scope);
    checkScope(scope);

    let response = await send(method, path, body, session.accessToken);
    checkScope(scope);
    // The token can still expire between the check above and the server reading it (a slow
    // network, a phone clock that is off). The API says so with TOKEN_EXPIRED: refresh once, retry.
    if (response.status === 401) {
      const error = await errorFromResponse(response);
      checkScope(scope);
      if (error.code !== 'TOKEN_EXPIRED') throw error;
      const latest = options.getSession()!;
      session = latest.accessToken !== session.accessToken ? latest : await refresh(scope);
      checkScope(scope);
      response = await send(method, path, body, session.accessToken);
      checkScope(scope);
    }
    if (!response.ok) throw await errorFromResponse(response);
    const result = await readBody<T>(response);
    checkScope(scope);
    return result;
  }

  async function authHeaders({ refresh: force = false }: { refresh?: boolean } = {}): Promise<
    Record<string, string>
  > {
    let session = options.getSession();
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const scope = currentScope();
    if (force || needsRefresh(session, now())) session = await refresh(scope);
    checkScope(scope);
    return { Authorization: `Bearer ${session.accessToken}` };
  }

  return {
    captureSession,
    request,
    url: (path) => options.baseUrl + path,
    authHeaders,
    get: (path) => request('GET', path),
    post: (path, body, opts) => request('POST', path, { body, auth: opts?.auth }),
    patch: (path, body) => request('PATCH', path, { body }),
  };
}
