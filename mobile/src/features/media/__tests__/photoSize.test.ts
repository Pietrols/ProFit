import { describe, expect, it } from 'vitest';
import { fitWithin } from '../photoSize';

describe('fitWithin', () => {
  it('leaves small photos alone', () => {
    expect(fitWithin(1080, 1080)).toBeNull();
    expect(fitWithin(640, 480)).toBeNull();
  });

  it('brings the longest side down to the limit', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1080 });
    expect(fitWithin(3024, 4032)).toEqual({ height: 1080 });
    expect(fitWithin(3000, 3000)).toEqual({ width: 1080 });
  });
});
