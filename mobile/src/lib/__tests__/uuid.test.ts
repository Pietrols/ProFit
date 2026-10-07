import { describe, expect, it } from 'vitest';
import { sha1, uuidv5 } from '../uuid';

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const bytes = (text: string) => new TextEncoder().encode(text);

// Reference values computed with Python's hashlib and uuid modules.
describe('sha1', () => {
  it('matches the standard digests', () => {
    expect(hex(sha1(bytes('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(hex(sha1(bytes('')))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(hex(sha1(bytes('a'.repeat(1000))))).toBe('291e9a6c66994949b57ba5e650361e98fc36b1ba');
  });
});

describe('uuidv5', () => {
  it('matches the reference implementation', () => {
    expect(uuidv5('python.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
    expect(uuidv5('https://profit.app/weight', '6ba7b811-9dad-11d1-80b4-00c04fd430c8')).toBe('278c3549-7cc1-546d-81e4-7b1c2d6b47f2');
  });

  it('gives the same id for the same name, a different one otherwise', () => {
    const ns = '6f1c2a60-9a52-4c8e-9a0b-3b6f4f2d7c11';
    expect(uuidv5('a/2026-10-07', ns)).toBe(uuidv5('a/2026-10-07', ns));
    expect(uuidv5('a/2026-10-07', ns)).not.toBe(uuidv5('a/2026-10-08', ns));
  });

  it('refuses a namespace that is not a UUID', () => {
    expect(() => uuidv5('x', 'nope')).toThrow(/Not a UUID/);
  });
});
