import { createApiClient, type ApiClient } from '../../../lib/api/client';
import type { WireRecord } from '../collections';

// An in-memory stand-in for the API's /sync routes, following the same rules as
// backend/src/sync/service.ts: later edit wins, one version sequence, paged pulls, and records that
// fail validation are reported as rejected. The real API is covered by backend/src/routes/sync.test.ts.

type Stored = { userId: string; collection: string; record: WireRecord; version: number };

export function fakeSyncServer() {
  const rows = new Map<string, Stored>();
  let version = 0;
  const state = { online: true, pushes: 0 };

  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  function handle(userId: string, url: URL, method: string, body: unknown): Response {
    if (method === 'POST' && url.pathname === '/sync/push') {
      state.pushes += 1;
      const result = { applied: [] as string[], ignored: [] as string[], rejected: [] as { collection: string; id: string; reason: string }[] };
      const changes = (body as { changes: Record<string, WireRecord[]> }).changes;
      for (const [collection, records] of Object.entries(changes)) {
        for (const record of records) {
          const kg = record.weightKg as number;
          if (collection === 'weight_entries' && (kg < 20 || kg > 400)) {
            result.rejected.push({ collection, id: record.id, reason: 'weightKg: too small or too large' });
            continue;
          }
          const existing = rows.get(record.id);
          if (existing && (existing.userId !== userId || existing.record.updatedAt >= record.updatedAt)) {
            result.ignored.push(record.id);
            continue;
          }
          version += 1;
          rows.set(record.id, { userId, collection, record: { ...record }, version });
          result.applied.push(record.id);
        }
      }
      return reply(200, result);
    }
    if (method === 'GET' && url.pathname === '/sync/pull') {
      const since = Number(url.searchParams.get('since') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 500);
      const mine = [...rows.values()].filter((r) => r.userId === userId && r.version > since).sort((a, b) => a.version - b.version);
      const page = mine.slice(0, limit);
      const changes: Record<string, WireRecord[]> = { weight_entries: [] };
      for (const r of page) (changes[r.collection] ??= []).push(r.record);
      return reply(200, { changes, cursor: page.length ? page[page.length - 1]!.version : since, hasMore: mine.length > limit });
    }
    return reply(404, { error: { code: 'NOT_FOUND', message: url.pathname } });
  }

  // An API client for one signed-in phone. Tokens are irrelevant here, so the session never expires.
  function clientFor(userId: string): ApiClient {
    return createApiClient({
      baseUrl: 'http://api.test',
      getSession: () => ({ accessToken: 'a', accessTokenExpiresAt: '2999-01-01T00:00:00.000Z', refreshToken: 'r' }),
      saveSession: async () => {},
      onSessionExpired: () => {},
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        if (!state.online) throw new TypeError('Network request failed');
        return handle(userId, new URL(String(input)), init?.method ?? 'GET', init?.body ? JSON.parse(String(init.body)) : undefined);
      }) as typeof fetch,
    });
  }

  return { state, rows, clientFor };
}
