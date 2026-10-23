import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Legacy files use owner/id; published replacements use owner/id.revision. The route supplies
// checked UUIDs and a SHA-256 hex revision, never user-provided path components.

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

// Checks the first bytes, so a file is the image type it claims to be (and not, say, a script).
export function matchesType(bytes: Buffer, type: MediaType): boolean {
  if (type === 'image/jpeg')
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png')
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

export function mediaStore(root: string) {
  const pathOf = (userId: string, id: string, revision?: string | null) =>
    join(root, userId, revision ? `${id}.${revision}` : id);
  return {
    // Writes to a temporary name first, so a reader never sees half a file.
    async write(userId: string, id: string, bytes: Buffer, revision?: string): Promise<void> {
      await mkdir(join(root, userId), { recursive: true });
      const destination = pathOf(userId, id, revision);
      const temp = `${destination}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, bytes, { flag: 'wx' });
        await rename(temp, destination);
      } finally {
        await rm(temp, { force: true });
      }
    },
    read: (userId: string, id: string, revision?: string | null) =>
      readFile(pathOf(userId, id, revision)),
  };
}

export type MediaStore = ReturnType<typeof mediaStore>;
