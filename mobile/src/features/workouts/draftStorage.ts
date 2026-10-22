import { readDraftRecord, workoutDraftKey, type DraftRecord, type DraftScope } from './draftRecord';
import type { WorkoutTimerStorage } from './timerStorage';

type PendingWrite = { value: string | null };
type Channel = { tail: Promise<void>; pending: PendingWrite | null };

// One shared instance per storage port keeps writes ordered across form remounts.
export function createWorkoutDraftStore(storage: WorkoutTimerStorage) {
  const channels = new Map<string, Channel>();
  function channelFor(key: string): Channel {
    let channel = channels.get(key);
    if (!channel) {
      channel = { tail: Promise.resolve(), pending: null };
      channels.set(key, channel);
    }
    return channel;
  }
  function enqueue<T>(key: string, channel: Channel, action: () => Promise<T>): Promise<T> {
    const result = channel.tail.then(action);
    const tail = result.then(
      () => {},
      () => {},
    );
    channel.tail = tail;
    void tail.then(() => {
      if (channel.tail === tail && !channel.pending) channels.delete(key);
    });
    return result;
  }
  function write(scope: DraftScope, value: string | null): Promise<void> {
    const key = workoutDraftKey(scope);
    const channel = channelFor(key);
    const pending = { value };
    channel.pending = pending;
    return enqueue(key, channel, async () => {
      if (value === null) await storage.removeItem(key);
      else await storage.setItem(key, value);
      if (channel.pending === pending) channel.pending = null;
    });
  }
  return {
    load(scope: DraftScope) {
      const key = workoutDraftKey(scope);
      const channel = channelFor(key);
      return enqueue(key, channel, async () => {
        const pending = channel.pending;
        const value = pending ? pending.value : await storage.getItem(key);
        let parsed: unknown = null;
        if (value !== null) {
          try {
            parsed = JSON.parse(value);
          } catch {
            throw new Error('The saved set draft could not be read. Retry before editing.');
          }
        }
        return {
          record: value === null ? null : readDraftRecord(parsed),
          persisted: pending === null,
        };
      });
    },
    save(scope: DraftScope, record: DraftRecord) {
      return write(scope, JSON.stringify(readDraftRecord(record)));
    },
    clear(scope: DraftScope) {
      return write(scope, null);
    },
  };
}
export type WorkoutDraftStore = ReturnType<typeof createWorkoutDraftStore>;
