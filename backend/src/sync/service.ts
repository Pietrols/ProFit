import { and, asc, eq, getTableColumns, gt, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { COLLECTION_NAMES, collections, type CollectionName } from './collections.js';

// Push and pull for every synced table. See docs/phases/PHASE_2.md for the protocol.

export const MAX_BATCH = 500;
// A phone whose clock runs ahead must not win every future merge, so edit times are capped at
// a little past the server's own time.
export const MAX_CLOCK_LEAD_MS = 5 * 60_000;

export type Rejected = { collection: CollectionName; id: string | null; reason: string };
export type PushResult = { applied: string[]; ignored: string[]; rejected: Rejected[] };
export type PullResult = { changes: Record<CollectionName, unknown[]>; cursor: number; hasMore: boolean };

export async function push(db: Db, userId: string, changes: Partial<Record<CollectionName, unknown[]>>, now: Date): Promise<PushResult> {
  const result: PushResult = { applied: [], ignored: [], rejected: [] };
  const latestAllowed = now.getTime() + MAX_CLOCK_LEAD_MS;

  await db.transaction(async (tx) => {
    // One push at a time per user, so versions are committed in the order they are handed out and
    // a pull never skips a row that a slower, earlier push was still writing.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);

    for (const name of COLLECTION_NAMES) {
      const { table, schema, toRow } = collections[name];
      for (const raw of changes[name] ?? []) {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          result.rejected.push({ collection: name, id: idOf(raw), reason: describe(parsed.error) });
          continue;
        }
        const record = parsed.data;
        const updatedAt = new Date(Math.min(Date.parse(record.updatedAt), latestAllowed));
        const deletedAt = record.deletedAt ? new Date(Math.min(Date.parse(record.deletedAt), latestAllowed)) : null;
        const data = toRow(record);

        // Insert, or replace the stored copy only when it belongs to this user and is older.
        // A record id owned by someone else is never touched and simply reported as ignored.
        const written = await tx
          .insert(table)
          .values({ id: record.id, userId, updatedAt, deletedAt, version: sql`nextval('sync_version_seq')`, ...data })
          .onConflictDoUpdate({
            target: table.id,
            set: excludedColumns(table, ['updatedAt', 'deletedAt', 'version', ...Object.keys(data)]),
            setWhere: and(eq(table.userId, userId), sql`${table.updatedAt} < excluded.updated_at`),
          })
          .returning({ id: table.id });

        (written.length ? result.applied : result.ignored).push(record.id);
      }
    }
  });

  return result;
}

export async function pull(db: Db, userId: string, since: number, limit: number): Promise<PullResult> {
  type Item = { name: CollectionName; version: number; wire: unknown };
  const items: Item[] = [];

  for (const name of COLLECTION_NAMES) {
    const { table, toWire } = collections[name];
    const rows = await db
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), gt(table.version, since)))
      .orderBy(asc(table.version))
      .limit(limit + 1);
    for (const row of rows) items.push({ name, version: row.version, wire: toWire(row) });
  }

  // One sequence feeds every table, so sorting by version gives one ordered stream.
  items.sort((a, b) => a.version - b.version);
  const page = items.slice(0, limit);
  const changes = Object.fromEntries(COLLECTION_NAMES.map((name) => [name, [] as unknown[]])) as Record<CollectionName, unknown[]>;
  for (const item of page) changes[item.name].push(item.wire);

  return {
    changes,
    cursor: page.length ? page[page.length - 1]!.version : since,
    hasMore: items.length > limit,
  };
}

// SET col = excluded.col for each listed property of the table.
function excludedColumns(table: (typeof collections)[CollectionName]['table'], keys: string[]) {
  const columns = getTableColumns(table) as Record<string, { name: string }>;
  return Object.fromEntries(keys.map((key) => [key, sql.raw(`excluded."${columns[key]!.name}"`)]));
}

function idOf(raw: unknown): string | null {
  const id = (raw as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id.slice(0, 64) : null;
}

function describe(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}
