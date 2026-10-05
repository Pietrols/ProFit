import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { API_VERSION, createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './lib/logger.js';
import { openTestDatabase } from './test/db.js';

const config = loadConfig({ NODE_ENV: 'test' });
const database = openTestDatabase();
const app = createApp(config, createLogger(config), {
  db: database.db,
  verifyGoogle: async () => {
    throw new Error('not used in these tests');
  },
});
afterAll(() => database.close());

describe('GET /health', () => {
  it('reports the server is up with its version', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', version: API_VERSION });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });
});

describe('error shape', () => {
  it('answers an unknown route with a 404 in the standard error shape', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'No route for GET /nope' } });
  });

  it('answers malformed JSON with a 400 instead of a crash', async () => {
    const res = await request(app).post('/health').set('Content-Type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('sends security headers and hides the framework', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
