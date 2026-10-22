import { describe, expect, it } from 'vitest';
import { photoState } from '../photoState';

const saved = { userId: 'first', photoId: 'same-id', uri: 'file:///private.jpg' };

describe('photo presentation ownership', () => {
  it('hides the previous account URI even when the photo id is unchanged', () => {
    expect(photoState('second', 'same-id', saved)).toEqual({ status: 'loading' });
    expect(photoState(null, 'same-id', saved)).toEqual({ status: 'none' });
    expect(photoState('first', 'different-id', saved)).toEqual({ status: 'loading' });
  });

  it('shows only the requested owner result and distinguishes pending from unavailable', () => {
    expect(photoState('first', 'same-id', null)).toEqual({ status: 'loading' });
    expect(photoState('first', 'same-id', saved)).toEqual({ status: 'ready', uri: saved.uri });
    expect(photoState('first', 'same-id', { ...saved, uri: null })).toEqual({ status: 'none' });
    expect(photoState('first', null, saved)).toEqual({ status: 'none' });
  });
});
