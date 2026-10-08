import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('applies defaults when nothing is set', () => {
    const c = loadConfig({});
    expect(c.PORT).toBe(4000);
    expect(c.NODE_ENV).toBe('development');
    expect(c.corsOrigins).toEqual([]);
  });

  it('parses the CORS list and trims spaces', () => {
    const c = loadConfig({ CORS_ORIGINS: 'https://a.example, https://b.example ,' });
    expect(c.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('refuses a port that is not a number, naming the bad setting', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
});

describe('database and auth settings', () => {
  const production = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://u:p@db:5432/profit',
    JWT_SECRET: 'x'.repeat(40),
    GOOGLE_CLIENT_IDS: 'web-client.apps.googleusercontent.com',
  };

  it('uses local development defaults outside production', () => {
    const c = loadConfig({});
    expect(c.DATABASE_URL).toBe('postgres://profit:profit@localhost:5432/profit');
    expect(c.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(c.googleClientIds).toEqual([]);
    expect(c.AUTH_DEV_LOGIN).toBe(false);
  });

  it('starts in production when every required setting is present', () => {
    const c = loadConfig(production);
    expect(c.googleClientIds).toEqual(['web-client.apps.googleusercontent.com']);
  });

  it.each(['DATABASE_URL', 'JWT_SECRET', 'GOOGLE_CLIENT_IDS'])('refuses to start in production without %s', (key) => {
    expect(() => loadConfig({ ...production, [key]: undefined })).toThrow(new RegExp(key));
  });

  it('refuses a short signing secret in production', () => {
    expect(() => loadConfig({ ...production, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('refuses developer sign-in in production but allows it in development', () => {
    expect(() => loadConfig({ ...production, AUTH_DEV_LOGIN: 'true' })).toThrow(/AUTH_DEV_LOGIN/);
    expect(loadConfig({ AUTH_DEV_LOGIN: 'true' }).AUTH_DEV_LOGIN).toBe(true);
  });
});
