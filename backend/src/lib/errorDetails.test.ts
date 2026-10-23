import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it } from 'vitest';
import { safeErrorDetails } from './errorDetails.js';
import { createLogger } from './logger.js';

describe('private error diagnostics', () => {
  it('does not serialize database parameters or nested private error messages', () => {
    const lines: string[] = [];
    const logger = createLogger(
      { NODE_ENV: 'production', LOG_LEVEL: 'info' },
      {
        write: (line) => {
          lines.push(line);
        },
      },
    );
    const privateText = 'Private limitations and workout notes';
    const cause = Object.assign(new Error(`Constraint detail: ${privateText}`), { code: '23514' });
    const error = new DrizzleQueryError(
      'UPDATE profiles SET limitations = $1',
      [privateText],
      cause,
    );
    logger.error({ err: error, method: 'PATCH', path: '/me' }, 'request failed');
    const serialized = JSON.parse(lines[0]!) as { err: Record<string, unknown> };
    expect(lines.join('')).not.toContain(privateText);
    expect(lines.join('')).not.toContain('UPDATE profiles');
    expect(serialized.err.databaseCode).toBe('23514');
    expect(serialized.err.stack).toContain('errorDetails.test.ts');
    for (const key of ['message', 'query', 'params', 'cause'])
      expect(serialized.err).not.toHaveProperty(key);
  });

  it('removes the complete multiline message before retaining diagnostic frames', () => {
    const secret = '    at private-note (private-medical-data:1:1)';
    const result = safeErrorDetails(new Error(`Failure\n${secret}`));
    expect(JSON.stringify(result)).not.toContain('private-medical-data');
    expect(result.stack).toContain('errorDetails.test.ts');
    expect(safeErrorDetails({ message: 'Private thrown payload' })).toEqual({
      type: 'UnknownError',
    });
  });
});
