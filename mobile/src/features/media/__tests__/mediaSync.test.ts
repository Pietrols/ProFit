import { describe, expect, it } from 'vitest';
import type { ApiClient } from '../../../lib/api/client';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { saveCustomExercise } from '../../exercises/customExercises';
import { syncedCollections } from '../../sync/collections';
import { createSyncEngine } from '../../sync/engine';
import { fakeSyncServer } from '../../sync/__tests__/fakeSyncServer';
import type { MediaFiles } from '../files';
import { createMediaSync, ON_SERVER, REFUSED, WAITING } from '../mediaSync';

const PETER = '0b9f3c2e-1d2a-4c5b-8e9f-0a1b2c3d4e5f';
let clockMs = Date.parse('2026-10-08T08:00:00.000Z');
const now = () => new Date(clockMs);

// The server's photo store. `answer` overrides the next upload replies (status and body).
function fakeMediaServer(state: { online: boolean }) {
  const stored = new Map<string, string>(); // id -> file contents
  const answers: { status: number; body: string }[] = [];
  const seenAuth: string[] = [];
  let downloads = 0;
  return {
    stored,
    answers,
    seenAuth,
    get downloads() {
      return downloads;
    },
    upload(url: string, headers: Record<string, string>, contents: string) {
      if (!state.online) throw new TypeError('Network request failed');
      seenAuth.push(headers.Authorization ?? '');
      const forced = answers.shift();
      if (forced) return forced;
      stored.set(url.split('/').pop()!, contents);
      return { status: 204, body: '' };
    },
    download(url: string) {
      downloads += 1;
      if (!state.online) throw new TypeError('Network request failed');
      const contents = stored.get(url.split('/').pop()!);
      if (contents === undefined) throw new Error('404');
      return contents;
    },
  };
}

// One phone's app folder, in memory.
function fakeFiles(server: ReturnType<typeof fakeMediaServer>) {
  const disk = new Map<string, string>();
  const files: MediaFiles = {
    async keep(sourceUri, id) {
      disk.set(`media/${id}.jpg`, `photo from ${sourceUri}`);
      return `media/${id}.jpg`;
    },
    exists: (path) => disk.has(path),
    remove: (path) => void disk.delete(path),
    uri: (path) => `file:///app/${path}`,
    async upload(path, url, headers) {
      return server.upload(url, headers, disk.get(path)!);
    },
    async download(url, id) {
      disk.set(`media/${id}.jpg`, server.download(url));
      return `media/${id}.jpg`;
    },
  };
  return { disk, files };
}

async function phone(sync: ReturnType<typeof fakeSyncServer>, media: ReturnType<typeof fakeMediaServer>, api?: ApiClient) {
  const db = await testDatabase();
  const { disk, files } = fakeFiles(media);
  const client = api ?? sync.clientFor(PETER);
  const photos = createMediaSync({ db, api: client, files, now });
  const engine = createSyncEngine({ db, api: client, collections: syncedCollections, beforePush: photos.uploadPending, now });
  await engine.setUser(PETER);
  return { db, disk, photos, engine };
}

const uploadState = async (db: Awaited<ReturnType<typeof testDatabase>>, id: string) =>
  (await db.first<{ uploaded: number }>('SELECT uploaded FROM media WHERE id = ?', [id]))?.uploaded;

describe('photo sync', () => {
  it('uploads a photo with its exercise, and another phone fetches it once', async () => {
    const sync = fakeSyncServer();
    const media = fakeMediaServer(sync.state);
    const a = await phone(sync, media);
    const b = await phone(sync, media);

    const photoId = await a.photos.addPhoto(PETER, 'content://gallery/1');
    await saveCustomExercise(a.db, PETER, { name: 'Sandbag Carry', category: 'strength', equipment: null, primary: ['forearms'], secondary: [], instructions: '', tracking: 'distance_time', photoId }, now());
    await a.engine.sync();
    expect(await uploadState(a.db, photoId)).toBe(ON_SERVER);
    expect(media.stored.get(photoId)).toBe('photo from content://gallery/1');

    await b.engine.sync();
    const [first, second] = await Promise.all([b.photos.photoUri(PETER, photoId), b.photos.photoUri(PETER, photoId)]);
    expect(first).toBe(`file:///app/media/${photoId}.jpg`);
    expect(second).toBe(first);
    expect(await b.photos.photoUri(PETER, photoId)).toBe(first);
    expect(media.downloads).toBe(1);
  });

  it('keeps a photo offline and holds back the records until it is uploaded', async () => {
    const sync = fakeSyncServer();
    const media = fakeMediaServer(sync.state);
    const a = await phone(sync, media);

    sync.state.online = false;
    const photoId = await a.photos.addPhoto(PETER, 'content://gallery/2');
    await saveCustomExercise(a.db, PETER, { name: 'Tyre Flip', category: 'strength', equipment: null, primary: ['glutes'], secondary: [], instructions: '', tracking: 'reps', photoId }, now());
    await a.engine.sync();
    expect(a.engine.getStatus()).toMatchObject({ offline: true });
    expect(await uploadState(a.db, photoId)).toBe(WAITING);
    expect(sync.rows.size).toBe(0);
    expect(await a.photos.photoUri(PETER, photoId)).toBe(`file:///app/media/${photoId}.jpg`);

    sync.state.online = true;
    await a.engine.sync();
    expect(await uploadState(a.db, photoId)).toBe(ON_SERVER);
    expect(sync.rows.size).toBe(1);
  });

  it('stops sending a photo the server refuses and tells the user why', async () => {
    const sync = fakeSyncServer();
    const media = fakeMediaServer(sync.state);
    const a = await phone(sync, media);

    const photoId = await a.photos.addPhoto(PETER, 'content://gallery/huge');
    media.answers.push({ status: 413, body: JSON.stringify({ error: { code: 'TOO_LARGE', message: 'The image is larger than 5 MB.' } }) });
    await a.engine.sync();
    expect(await uploadState(a.db, photoId)).toBe(REFUSED);
    expect(a.engine.getStatus().problem).toContain('The image is larger than 5 MB.');

    await a.engine.sync();
    expect(media.seenAuth).toHaveLength(1);
  });

  it('tries again on the next run after a server fault', async () => {
    const sync = fakeSyncServer();
    const media = fakeMediaServer(sync.state);
    const a = await phone(sync, media);

    const photoId = await a.photos.addPhoto(PETER, 'content://gallery/3');
    media.answers.push({ status: 503, body: '' });
    await a.engine.sync();
    expect(await uploadState(a.db, photoId)).toBe(WAITING);

    await a.engine.sync();
    expect(await uploadState(a.db, photoId)).toBe(ON_SERVER);
  });

  it('gives up on a photo whose file was removed before it was uploaded', async () => {
    const sync = fakeSyncServer();
    const media = fakeMediaServer(sync.state);
    const a = await phone(sync, media);

    const photoId = await a.photos.addPhoto(PETER, 'content://gallery/4');
    a.disk.clear();
    expect(await a.photos.uploadPending(PETER)).toEqual(['A photo was removed from this phone before it was saved to the server.']);
    expect(await uploadState(a.db, photoId)).toBe(REFUSED);
    expect(await a.photos.photoUri(PETER, photoId)).toBeNull();
  });

  it('waits a minute before downloading a photo again after a failure', async () => {
    const sync = fakeSyncServer();
    const media = fakeMediaServer(sync.state);
    const b = await phone(sync, media);
    media.stored.set('photo-1', 'bytes');

    sync.state.online = false;
    expect(await b.photos.photoUri(PETER, 'photo-1')).toBeNull();
    sync.state.online = true;
    expect(await b.photos.photoUri(PETER, 'photo-1')).toBeNull();
    expect(media.downloads).toBe(1);

    clockMs += 61_000;
    expect(await b.photos.photoUri(PETER, 'photo-1')).toBe('file:///app/media/photo-1.jpg');
  });

  it('refreshes an expired token once and sends the photo again', async () => {
    const sync = fakeSyncServer();
    const media = fakeMediaServer(sync.state);
    const api = {
      url: (path: string) => `http://api.test${path}`,
      authHeaders: async (o?: { refresh?: boolean }) => ({ Authorization: o?.refresh ? 'Bearer new' : 'Bearer old' }),
    } as unknown as ApiClient;
    const db = await testDatabase();
    const { files } = fakeFiles(media);
    const photos = createMediaSync({ db, api, files, now });

    const photoId = await photos.addPhoto(PETER, 'content://gallery/5');
    media.answers.push({ status: 401, body: JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'Expired.' } }) });
    expect(await photos.uploadPending(PETER)).toEqual([]);
    expect(media.seenAuth).toEqual(['Bearer old', 'Bearer new']);
    expect(await uploadState(db, photoId)).toBe(ON_SERVER);
  });

  it('does nothing with photos where the device cannot keep files', async () => {
    const db = await testDatabase();
    const photos = createMediaSync({ db, api: fakeSyncServer().clientFor(PETER), files: null, now });
    expect(photos.available).toBe(false);
    expect(await photos.uploadPending(PETER)).toEqual([]);
    expect(await photos.photoUri(PETER, 'x')).toBeNull();
    await expect(photos.addPhoto(PETER, 'content://x')).rejects.toThrow('Photos are not available here.');
  });
});
