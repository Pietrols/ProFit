import type { ApiClient } from '../../lib/api/client';
import { errorFromBody, NetworkError } from '../../lib/api/errors';
import type { Database } from '../../lib/db/database';
import { randomId } from '../../lib/randomId';
import type { MediaFiles } from './files';

// Photos on the phone and on the server. A photo is kept on the phone first (offline first), sent
// to the server before the records that point at it, and fetched once by other phones.
// No React Native imports: tests use a fake MediaFiles and Node's SQLite.

// media.uploaded
export const WAITING = 0; // on this phone only
export const ON_SERVER = 1;
export const REFUSED = 2; // the server will never take it, or the file is gone: stop trying

// After a failed download, wait this long before trying the same photo again.
const RETRY_DOWNLOAD_MS = 60_000;

const CONTENT_TYPE = 'image/jpeg';

type Options = {
  db: Database;
  api: ApiClient;
  files: MediaFiles | null;
  now?: () => Date;
};

type Row = { id: string; local_path: string | null; uploaded: number };

export function createMediaSync({ db, api, files, now = () => new Date() }: Options) {
  const downloads = new Map<string, Promise<string | null>>();
  const failedAt = new Map<string, number>();

  async function uploadOne(path: string, id: string): Promise<{ status: number; body: string }> {
    if (!files) throw new Error('Photos are not available here.');
    const url = api.url(`/media/${id}`);
    const send = async (refresh: boolean) => {
      const headers = await api.authHeaders({ refresh });
      try {
        return await files.upload(path, url, headers, CONTENT_TYPE);
      } catch {
        throw new NetworkError();
      }
    };
    const first = await send(false);
    if (first.status !== 401 || errorFromBody(401, first.body).code !== 'TOKEN_EXPIRED') return first;
    return send(true);
  }

  return {
    // Whether this device can keep photos at all (not in the web preview).
    available: files !== null,

    // Keeps a picked photo for the signed-in user and returns the id records point at.
    async addPhoto(userId: string, sourceUri: string): Promise<string> {
      if (!files) throw new Error('Photos are not available here.');
      const id = randomId();
      const path = await files.keep(sourceUri, id);
      await db.run('INSERT INTO media (id, user_id, local_path, content_type, uploaded, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
        id,
        userId,
        path,
        CONTENT_TYPE,
        WAITING,
        now().toISOString(),
      ]);
      return id;
    },

    // Sends every waiting photo. Returns problems worth telling the user about; throws when the
    // server cannot be reached, so the sync run reports being offline and tries again later.
    async uploadPending(userId: string): Promise<string[]> {
      if (!files) return [];
      const problems: string[] = [];
      const rows = await db.all<Row>('SELECT id, local_path, uploaded FROM media WHERE user_id = ? AND uploaded = ?', [userId, WAITING]);
      for (const row of rows) {
        if (!row.local_path || !files.exists(row.local_path)) {
          await db.run('UPDATE media SET uploaded = ? WHERE id = ?', [REFUSED, row.id]);
          problems.push('A photo was removed from this phone before it was saved to the server.');
          continue;
        }
        const answer = await uploadOne(row.local_path, row.id);
        if (answer.status >= 200 && answer.status < 300) {
          await db.run('UPDATE media SET uploaded = ? WHERE id = ?', [ON_SERVER, row.id]);
        } else if (answer.status >= 400 && answer.status < 500 && answer.status !== 401) {
          // Wrong type, too big, or not ours: sending it again will not change the answer.
          await db.run('UPDATE media SET uploaded = ? WHERE id = ?', [REFUSED, row.id]);
          problems.push(errorFromBody(answer.status, answer.body).message);
        } else {
          // Signed out on the server, or a server fault: stop here and try again on the next run.
          throw errorFromBody(answer.status, answer.body);
        }
      }
      return problems;
    },

    // An address to show the photo, downloading it once if this phone does not have it.
    // Null when it cannot be had right now (offline, not found, or no photos on this device).
    async photoUri(userId: string, photoId: string): Promise<string | null> {
      if (!files) return null;
      const row = await db.first<Row>('SELECT id, local_path, uploaded FROM media WHERE id = ? AND user_id = ?', [photoId, userId]);
      if (row?.local_path && files.exists(row.local_path)) return files.uri(row.local_path);
      // Kept on this phone but the file is gone, and the server never got it: nothing to fetch.
      if (row && row.uploaded !== ON_SERVER) return null;

      const failed = failedAt.get(photoId);
      if (failed !== undefined && now().getTime() - failed < RETRY_DOWNLOAD_MS) return null;

      const key = `${userId}/${photoId}`;
      let pending = downloads.get(key);
      if (!pending) {
        pending = (async () => {
          try {
            const path = await files.download(api.url(`/media/${photoId}`), photoId, await api.authHeaders());
            await db.run(
              `INSERT INTO media (id, user_id, local_path, content_type, uploaded, created_at) VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET local_path = excluded.local_path WHERE media.user_id = excluded.user_id`,
              [photoId, userId, path, CONTENT_TYPE, ON_SERVER, now().toISOString()],
            );
            failedAt.delete(photoId);
            return files.uri(path);
          } catch {
            failedAt.set(photoId, now().getTime());
            return null;
          } finally {
            downloads.delete(key);
          }
        })();
        downloads.set(key, pending);
      }
      return pending;
    },
  };
}

export type MediaSync = ReturnType<typeof createMediaSync>;
