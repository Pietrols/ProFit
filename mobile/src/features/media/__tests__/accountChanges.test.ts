import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../../lib/api/client';
import type { SqlValue } from '../../../lib/db/database';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import type { MediaFiles } from '../files';
import { createMediaSync, WAITING } from '../mediaSync';

const firstUser = '00000000-0000-4000-8000-000000000001';
const secondUser = '00000000-0000-4000-8000-000000000002';

async function harness() {
  const db = await testDatabase();
  let account = firstUser;
  const api = createApiClient({
    baseUrl: 'http://api.test',
    getUserId: () => account,
    getSession: () => ({
      accessToken: account,
      refreshToken: account,
      accessTokenExpiresAt: '2999-01-01T00:00:00Z',
    }),
    saveSession: async () => {},
    onSessionExpired: () => {},
  });
  const files: MediaFiles = {
    keep: async () => 'media/photo.jpg',
    exists: () => true,
    remove: () => {},
    uri: (path) => `file:///${path}`,
    upload: vi.fn(async () => ({ status: 201, body: '' })),
    download: vi.fn(async () => 'media/download.jpg'),
  };
  const photos = createMediaSync({ db, api, files });
  const change = () => {
    account = secondUser;
  };
  return { db, api, files, photos, change };
}

describe('photo ownership across asynchronous work', () => {
  it('does not send selected photos using a newly signed-in account', async () => {
    const h = await harness();
    const id = await h.photos.addPhoto(firstUser, 'content://photo');
    const all = h.db.all;
    h.db.all = async <T>(sql: string, params?: SqlValue[]): Promise<T[]> => {
      const rows = await all<T>(sql, params);
      if (sql.startsWith('SELECT id, local_path')) h.change();
      return rows;
    };
    await expect(h.photos.uploadPending(firstUser)).rejects.toThrow('sign-in changed');
    expect(h.files.upload).not.toHaveBeenCalled();
    expect(await h.db.first('SELECT uploaded FROM media WHERE id = ?', [id])).toEqual({
      uploaded: WAITING,
    });
  });

  it.each([201, 401])(
    'does not acknowledge or retry an old transfer after status %s',
    async (status) => {
      const h = await harness();
      const id = await h.photos.addPhoto(firstUser, 'content://photo');
      h.files.upload = vi.fn(async () => {
        h.change();
        return {
          status,
          body: JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'Expired.' } }),
        };
      });
      await expect(h.photos.uploadPending(firstUser)).rejects.toThrow('sign-in changed');
      expect(h.files.upload).toHaveBeenCalledTimes(1);
      expect(await h.db.first('SELECT uploaded FROM media WHERE id = ?', [id])).toEqual({
        uploaded: WAITING,
      });
    },
  );

  it('checks the owner again when an acknowledgement transaction begins', async () => {
    const h = await harness();
    const id = await h.photos.addPhoto(firstUser, 'content://photo');
    const transaction = h.db.transaction;
    h.db.transaction = (action) => {
      h.change();
      return transaction(action);
    };
    await expect(h.photos.uploadPending(firstUser)).rejects.toThrow('sign-in changed');
    expect(await h.db.first('SELECT uploaded FROM media WHERE id = ?', [id])).toEqual({
      uploaded: WAITING,
    });
  });

  it('does not attach a picked photo after its sign-in changes', async () => {
    const h = await harness();
    h.files.keep = async () => {
      h.change();
      return 'media/photo.jpg';
    };
    await expect(h.photos.addPhoto(firstUser, 'content://photo')).rejects.toThrow(
      'sign-in changed',
    );
    expect(await h.db.all('SELECT * FROM media')).toEqual([]);
  });
});
