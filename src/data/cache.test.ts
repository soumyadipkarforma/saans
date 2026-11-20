import { describe, expect, it } from 'vitest';
import { coordKey, TtlCache } from './cache';

describe('TtlCache', () => {
  it('returns a value before the TTL and misses once it has passed', () => {
    let t = 0;
    const cache = new TtlCache<string>(1000, () => t);
    cache.set('a', 'x');
    t = 999;
    expect(cache.get('a')).toBe('x');
    t = 1000;
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the oldest entry once max is exceeded', () => {
    const cache = new TtlCache<number>(1000, () => 0, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('overwriting an existing key does not evict anything', () => {
    const cache = new TtlCache<number>(1000, () => 0, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBe(2);
  });

  it('uses Date.now when no clock is injected', () => {
    const cache = new TtlCache<string>(60_000);
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
  });
});

describe('coordKey', () => {
  it('rounds coordinates to 2 decimal places', () => {
    expect(coordKey(28.6139, 77.209)).toBe(coordKey(28.6141, 77.2088));
  });

  it('separates points about 1 km apart', () => {
    expect(coordKey(28.61, 77.21)).not.toBe(coordKey(28.62, 77.21));
  });
});
