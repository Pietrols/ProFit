import { describe, expect, it, vi } from 'vitest';
import { createRestAlerts, type RestPort, type RestRequest } from '../restAlerts';
import { pauseTimer, startTimer } from '../timers';

const timer = (generation = 'a') => startTimer({ mode: 'rest', seconds: 30 }, 1000, generation);
function fixture() {
  const pending = new Map<string, RestRequest>(); let serial = 0;
  const port: RestPort = {
    list: async () => [...pending.values()],
    cancel: vi.fn(async (id) => { pending.delete(id); }),
    schedule: vi.fn(async (request) => { const id = String(++serial); pending.set(id, { ...request, id }); return id; }),
    permitted: vi.fn(async () => true),
  };
  return { pending, port, alerts: createRestAlerts(port, () => 2000) };
}
describe('scheduled rest alerts', () => {
  it('keeps a matching alert and replaces it when an early set starts new rest', async () => {
    const { alerts, pending, port } = fixture(); await alerts.setUser('u');
    await alerts.update('u', 's', timer()); await alerts.update('u', 's', timer());
    expect(port.schedule).toHaveBeenCalledTimes(1);
    await alerts.update('u', 's', timer('b'));
    expect(port.cancel).toHaveBeenCalledWith('1');
    expect([...pending.values()]).toEqual([{ user: 'u', session: 's', generation: 'b', at: 31000, id: '2' }]);
  });
  it.each(['pause', 'clear', 'stopwatch'] as const)('cancels on %s', async (action) => {
    const { alerts, pending } = fixture(); await alerts.setUser('u'); await alerts.update('u', 's', timer());
    await alerts.update('u', 's', action === 'pause' ? pauseTimer(timer(), 2000) : action === 'clear' ? null : startTimer({ mode: 'stopwatch' }, 2000, 'b'));
    expect(pending.size).toBe(0);
  });
  it('cancels a late schedule after sign-out and ignores old-account writes', async () => {
    const { alerts, pending, port } = fixture(); await alerts.setUser('u');
    let finish!: (id: string) => void; let started!: () => void;
    const began = new Promise<void>((resolve) => { started = resolve; });
    port.schedule = async (request) => { started(); const id = await new Promise<string>((resolve) => { finish = resolve; }); pending.set(id, { ...request, id }); return id; };
    const update = alerts.update('u', 's', timer()); await began;
    const signOut = alerts.setUser(null); finish('late'); await update; await signOut;
    await alerts.update('u', 's', timer());
    expect(pending.size).toBe(0); expect(port.cancel).toHaveBeenCalledWith('late');
  });
  it('cancels a late schedule after pause', async () => {
    const { alerts, pending, port } = fixture(); await alerts.setUser('u');
    let finish!: (id: string) => void; let started!: () => void;
    const began = new Promise<void>((resolve) => { started = resolve; });
    port.schedule = async (request) => { started(); const id = await new Promise<string>((resolve) => { finish = resolve; }); pending.set(id, { ...request, id }); return id; };
    const update = alerts.update('u', 's', timer()); await began;
    const pause = alerts.update('u', 's', pauseTimer(timer(), 2000)); finish('late');
    await update; await pause; expect(pending.size).toBe(0);
  });
  it('reports denied permissions, then allows retry without poisoning the queue', async () => {
    const { alerts, port, pending } = fixture(); await alerts.setUser('u');
    port.permitted = async () => false;
    await expect(alerts.update('u', 's', timer())).rejects.toThrow('Background alerts are off');
    expect(pending.size).toBe(0);
    port.permitted = async () => true;
    await alerts.update('u', 's', timer()); expect(pending.size).toBe(1);
  });
  it('recovers after a scheduling failure and does not create expired alerts', async () => {
    const { alerts, port } = fixture(); await alerts.setUser('u');
    const schedule = port.schedule; port.schedule = async () => { throw new Error('OS unavailable'); };
    await expect(alerts.update('u', 's', timer())).rejects.toThrow('OS unavailable');
    port.schedule = schedule;
    await alerts.update('u', 's', startTimer({ mode: 'rest', seconds: 1 }, 0, 'expired'));
    expect(schedule).not.toHaveBeenCalled();
    await alerts.update('u', 's', timer()); expect(schedule).toHaveBeenCalledOnce();
  });
  it('reconciles OS-persisted requests after restart against local active timers', async () => {
    const { alerts, pending } = fixture();
    const request = { user: 'u', session: 's', generation: 'a', at: 31000 };
    pending.set('good', { ...request, id: 'good' });
    pending.set('duplicate', { ...request, id: 'duplicate' });
    pending.set('stale', { ...request, generation: 'old', id: 'stale' });
    pending.set('other', { ...request, user: 'other', id: 'other' });
    pending.set('finished', { ...request, session: 'ended', id: 'finished' });
    await alerts.setUser('u');
    await alerts.reconcile(async (_user, session) => session === 's' ? timer() : null);
    expect([...pending.keys()]).toEqual(['good']);
  });
});
