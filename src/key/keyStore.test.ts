import { afterEach, describe, expect, it, vi } from 'vitest';
import { keyStore } from './keyStore';

const KEY = 'AIza-0123456789-abcdefghij';
afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('keyStore', () => {
  it('round-trips through sessionStorage only and trims', () => {
    expect(keyStore.set(`  ${KEY}  `)).toBe(true);
    expect(keyStore.get()).toBe(KEY);
    expect(sessionStorage.getItem('saans.geminiKey')).toBe(KEY);
    expect(localStorage.length).toBe(0);
  });
  it('clear removes the key', () => {
    keyStore.set(KEY);
    keyStore.clear();
    expect(keyStore.get()).toBeNull();
  });
  it('rejects a key shorter than 20 characters', () => {
    expect(keyStore.set('short')).toBe(false);
    expect(keyStore.get()).toBeNull();
  });
  it('survives blocked storage', () => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error('blocked');
      });
    }
    expect(keyStore.get()).toBeNull();
    expect(keyStore.set(KEY)).toBe(false);
    expect(() => keyStore.clear()).not.toThrow();
  });
});
