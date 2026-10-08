import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Image files on disk: MEDIA_DIR/<user id>/<media id>. Ids are UUIDs checked by the route, so they
// are safe to use as path parts.

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

// Checks the first bytes, so a file is the image type it claims to be (and not, say, a script).
export function matchesType(bytes: Buffer, type: MediaType): boolean {
  if (type === 'image/jpeg') return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

export function mediaStore(root: string) {
  const pathOf = (userId: string, id: string) => join(root, userId, id);
  return {
    // Writes to a temporary name first, so a reader never sees half a file.
    async write(userId: string, id: string, bytes: Buffer): Promise<void> {
      await mkdir(join(root, userId), { recursive: true });
      const temp = `${pathOf(userId, id)}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temp, bytes);
      await rename(temp, pathOf(userId, id));
    },
    read: (userId: string, id: string) => readFile(pathOf(userId, id)),
  };
}

export type MediaStore = ReturnType<typeof mediaStore>;
