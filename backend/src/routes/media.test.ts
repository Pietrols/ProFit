import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { GoogleVerifier } from '../auth/google.js';
import { loadConfig } from '../config.js';
import { unauthorized } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { mediaStore } from '../media/store.js';
import { openTestDatabase, resetTables } from '../test/db.js';

const database = openTestDatabase();
const dir = await mkdtemp(join(tmpdir(), 'profit-media-'));
const rejectGoogle: GoogleVerifier = async () => {
  throw unauthorized('GOOGLE_TOKEN_INVALID', 'not used here');
};
const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 's'.repeat(40), AUTH_DEV_LOGIN: 'true' });
const app = createApp(config, createLogger(config), { db: database.db, verifyGoogle: rejectGoogle, media: mediaStore(dir) });

const ID = '9d1c7a8e-5b2f-4c3d-8e1f-2a3b4c5d6e7f';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50, 1)]);

async function signIn(email: string) {
  const res = await request(app).post('/auth/dev').send({ email });
  return res.body.session.accessToken as string;
}
const upload = (token: string, body: Buffer, type = 'image/jpeg', id = ID) =>
  request(app).put(`/media/${id}`).set('Authorization', `Bearer ${token}`).set('Content-Type', type).send(body);

beforeEach(() => resetTables(database));
afterAll(async () => {
  await database.close();
  await rm(dir, { recursive: true, force: true });
});

describe('media', () => {
  it('stores an image and gives it back to its owner', async () => {
    const token = await signIn('peter@example.com');
    const put = await upload(token, JPEG);
    expect(put.status).toBe(201);
    expect(put.body).toEqual({ id: ID, contentType: 'image/jpeg', bytes: JPEG.length });

    const get = await request(app).get(`/media/${ID}`).set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(get.body as Buffer, JPEG)).toBe(0);
  });

  it('replaces the file when the same id is uploaded again', async () => {
    const token = await signIn('peter@example.com');
    await upload(token, JPEG);
    expect((await upload(token, PNG, 'image/png')).status).toBe(201);
    const get = await request(app).get(`/media/${ID}`).set('Authorization', `Bearer ${token}`);
    expect(get.headers['content-type']).toBe('image/png');
  });

  it("keeps one user's images from another", async () => {
    const peter = await signIn('peter@example.com');
    const other = await signIn('mallory@example.com');
    await upload(peter, JPEG);
    expect((await request(app).get(`/media/${ID}`).set('Authorization', `Bearer ${other}`)).status).toBe(404);
    expect((await upload(other, JPEG)).status).toBe(404);
  });

  it('refuses other file types, mislabelled files, empty bodies and bad ids', async () => {
    const token = await signIn('peter@example.com');
    expect((await upload(token, Buffer.from('<svg/>'), 'image/svg+xml')).status).toBe(415);
    expect((await upload(token, PNG, 'image/jpeg')).body.error.message).toMatch(/not a JPEG/);
    expect((await upload(token, Buffer.alloc(0))).status).toBe(400);
    expect((await upload(token, JPEG, 'image/jpeg', 'not-a-uuid')).status).toBe(400);
  });

  it('refuses images over 5 MB', async () => {
    const token = await signIn('peter@example.com');
    const big = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    expect((await upload(token, big)).status).toBe(413);
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).put(`/media/${ID}`).set('Content-Type', 'image/jpeg').send(JPEG)).status).toBe(401);
    expect((await request(app).get(`/media/${ID}`)).status).toBe(401);
  });
});
