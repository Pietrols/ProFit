import { restAlertIntent, type SavedAlert, type TimerState } from './timers';

export type RestRequest = SavedAlert & { user: string; session: string };
export type RestPort = {
  list(): Promise<RestRequest[]>;
  cancel(id: string): Promise<void>;
  schedule(request: Omit<RestRequest, 'id'>): Promise<string>;
  permitted(): Promise<boolean>;
};

// The OS persists request ids and ownership tags, including across a process crash.
// All OS writes share one queue. Revisions invalidate in-flight schedules immediately.
export function createRestAlerts(port: RestPort, now = Date.now) {
  let owner: string | null = null;
  let epoch = 0;
  let queue = Promise.resolve();
  const revisions = new Map<string, number>();
  const enqueue = (work: () => Promise<void>) => {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };
  return {
    setUser(user: string | null) {
      if (owner !== user) {
        owner = user;
        epoch++;
        revisions.clear();
      }
      return enqueue(async () => {
        for (const request of await port.list())
          if (request.user !== owner) await port.cancel(request.id);
      });
    },
    update(user: string, session: string, timer: TimerState | null) {
      if (user !== owner) return Promise.resolve();
      const version = (revisions.get(session) ?? 0) + 1;
      revisions.set(session, version);
      const startedEpoch = epoch;
      const current = () =>
        owner === user && epoch === startedEpoch && revisions.get(session) === version;
      return enqueue(async () => {
        if (!current()) return;
        const requests = (await port.list()).filter(
          (r) => r.user === user && r.session === session,
        );
        let kept = false;
        for (const request of requests) {
          const intent = restAlertIntent(timer, request, now());
          if (intent.cancelId || kept) await port.cancel(request.id);
          else kept = true;
        }
        if (!current() || kept) return;
        const intent = restAlertIntent(timer, null, now());
        if (!intent.schedule) return;
        if (!(await port.permitted()))
          throw new Error(
            'Background alerts are off. Enable rest alerts or check notification settings.',
          );
        if (!current() || intent.schedule.at <= now()) return;
        const id = await port.schedule({ ...intent.schedule, user, session });
        if (!current()) await port.cancel(id);
      });
    },
    reconcile(read: (user: string, session: string) => Promise<TimerState | null>) {
      const startedEpoch = epoch;
      const versions = new Map(revisions);
      return enqueue(async () => {
        const seen = new Set<string>();
        for (const request of await port.list()) {
          if (startedEpoch !== epoch) return;
          if (request.user !== owner) {
            await port.cancel(request.id);
            continue;
          }
          // A newer explicit transition owns this session and is queued behind this read.
          if (versions.get(request.session) !== revisions.get(request.session)) continue;
          const timer = await read(request.user, request.session);
          if (
            startedEpoch !== epoch ||
            versions.get(request.session) !== revisions.get(request.session)
          )
            continue;
          const stale = restAlertIntent(timer, request, now()).cancelId !== null;
          if (stale || seen.has(request.session)) await port.cancel(request.id);
          else seen.add(request.session);
        }
      });
    },
  };
}
