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
