import { validTime } from './model';

type Revision = { id: string; updatedAt: string; deletedAt?: string | null };

// Scope to the owned parent before calling. Resolve before filtering invalid or deleted payloads.
export function latestRecords<T extends Revision>(records: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const record of records) {
    if (!validTime(record.updatedAt)) continue;
    const previous = latest.get(record.id);
    const time = Date.parse(record.updatedAt);
    const previousTime = previous ? Date.parse(previous.updatedAt) : -Infinity;
    if (
      !previous ||
      time > previousTime ||
      (time === previousTime &&
        ((Boolean(record.deletedAt) && !previous.deletedAt) ||
          (Boolean(record.deletedAt) === Boolean(previous.deletedAt) &&
            JSON.stringify(record) > JSON.stringify(previous))))
    )
      latest.set(record.id, record);
  }
  return [...latest.values()];
}
