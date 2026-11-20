const DEFAULT_MAX_ENTRIES = 200;

// In-memory TTL cache with insertion-order eviction (oldest entry goes first).
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly max: number;

  constructor(ttlMs: number, now: () => number = () => Date.now(), max = DEFAULT_MAX_ENTRIES) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.max = max;
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    if (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}

// Coordinates to 2 dp (about 1 km) so nearby lookups share one cache entry.
export function coordKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}
