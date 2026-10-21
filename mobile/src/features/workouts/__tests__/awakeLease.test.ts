import { describe, expect, it, vi } from 'vitest';
import { awakeLease } from '../awakeLease';

describe('workout wake lock lifecycle', () => {
  it('releases again if activation finishes after leaving the screen', async () => {
    let activate!: () => void;
    const api = {
      activate: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            activate = resolve;
          }),
      ),
      deactivate: vi.fn(async () => {}),
    };
    const error = vi.fn();
    const release = awakeLease(api, 'visit-a', error);
    release();
    activate();
    await Promise.resolve();
    expect(api.deactivate.mock.calls).toEqual([['visit-a'], ['visit-a']]);
    expect(error).not.toHaveBeenCalled();
  });
  it('reports activation failures without an unhandled rejection', async () => {
    const error = vi.fn();
    const release = awakeLease(
      {
        activate: async () => {
          throw new Error('unavailable');
        },
        deactivate: async () => {},
      },
      'a',
      error,
    );
    await Promise.resolve();
    expect(error).toHaveBeenCalledOnce();
    release();
  });
});
