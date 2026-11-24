const STORAGE_KEY = 'saans.geminiKey';
const MIN_LENGTH = 20;

// The key lives in sessionStorage only: gone when the tab closes, never logged, never in a URL.
export const keyStore = {
  get(): string | null {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  /** Returns false when the key is too short to be real or storage is blocked. */
  set(key: string): boolean {
    const clean = key.trim();
    if (clean.length < MIN_LENGTH) return false;
    try {
      sessionStorage.setItem(STORAGE_KEY, clean);
      return true;
    } catch {
      return false;
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing stored if storage is blocked.
    }
  },
};
export type KeyStore = Pick<typeof keyStore, 'get' | 'clear'>;
