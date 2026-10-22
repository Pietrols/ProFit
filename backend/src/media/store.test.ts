import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { mediaStore } from './store.js';

describe('media file publication', () => {
  it('keeps concurrent temporary writes separate even at the same timestamp', async () => {
    const root = await mkdtemp(join(tmpdir(), 'profit-concurrent-media-'));
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1);
    try {
      const store = mediaStore(root);
      const images = Array.from({ length: 8 }, (_, n) => Buffer.alloc(128, n));
      await expect(
        Promise.all(images.map((bytes) => store.write('owner', 'photo', bytes))),
      ).resolves.toHaveLength(8);
      const saved = await store.read('owner', 'photo');
      expect(images.some((bytes) => bytes.equals(saved))).toBe(true);
      expect(await readdir(join(root, 'owner'))).toEqual(['photo']);
    } finally {
      clock.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
});
