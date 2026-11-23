interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttlMs: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

export function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.cachedAt > entry.ttlMs) {
    memoryCache.delete(key);
    return null;
  }

  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttlSeconds: number = 60): void {
  memoryCache.set(key, {
    data,
    cachedAt: Date.now(),
    ttlMs: ttlSeconds * 1000
  });
}

export function invalidateCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      memoryCache.delete(key);
    }
  }
}
