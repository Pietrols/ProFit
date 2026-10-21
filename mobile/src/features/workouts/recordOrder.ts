import { validTime } from './model';

type Revision = { id: string; updatedAt: string; deletedAt?: string | null };

// Scope to the owned parent before calling. Resolve before filtering invalid or deleted payloads.
export function latestRecords<T extends Revision>(records: readonly T[]): T[] {
  return resolveRecordRevisions(records).latest;
}

export function resolveRecordRevisions<T extends Revision>(records: readonly T[]) {
  const latest = new Map<string, { record: T; time: number }>();
  const times = new Map<string, number | null>();
  const unavailable = new Set<string>();
  for (const record of records) {
    if (!times.has(record.updatedAt))
      times.set(
        record.updatedAt,
        validTime(record.updatedAt) ? Date.parse(record.updatedAt) : null,
      );
    const time = times.get(record.updatedAt)!;
    if (time === null) {
      unavailable.add(record.id);
      continue;
    }
    const previous = latest.get(record.id);
    if (
      !previous ||
      time > previous.time ||
      (time === previous.time &&
        ((Boolean(record.deletedAt) && !previous.record.deletedAt) ||
          (Boolean(record.deletedAt) === Boolean(previous.record.deletedAt) &&
            JSON.stringify(record) > JSON.stringify(previous.record))))
    )
      latest.set(record.id, { record, time });
  }
  return {
    latest: [...latest.values()].map(({ record }) => record),
    unavailableIds: [...unavailable].sort(),
  };
}
