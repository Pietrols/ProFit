import { describe, expect, it } from 'vitest';
import {
  validateDisplayName,
  validateEmail,
  validatePassword,
  validatePasswordMatch,
} from '../validate';

describe('auth validation', () => {
  it('accepts a valid registration set', () => {
    expect(validateDisplayName('Alex')).toBeUndefined();
    expect(validateEmail('a@b.co')).toBeUndefined();
    expect(validatePassword('hunter2secure')).toBeUndefined();
    expect(validatePasswordMatch('hunter2secure', 'hunter2secure')).toBeUndefined();
  });

  it('blocks a password mismatch with a clear message', () => {
    expect(validatePasswordMatch('hunter2secure', 'hunter2secur')).toBe(
      'Passwords do not match',
    );
  });

  it('requires the confirm field to be filled', () => {
    expect(validatePasswordMatch('hunter2secure', '')).toBe(
      'Please confirm your password',
    );
  });

  it('still enforces the base password rules', () => {
    expect(validatePassword('short')).toMatch(/at least 8/);
    expect(validateEmail('nope')).toMatch(/email/);
  });
});
