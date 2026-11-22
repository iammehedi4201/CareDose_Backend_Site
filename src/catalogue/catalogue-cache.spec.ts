import { describe, expect, it, vi } from 'vitest';
import { CatalogueCacheService } from './catalogue-cache';

describe('CatalogueCacheService', () => {
  it('caches entries, evicts oldest entry beyond max capacity, expires after TTL, and clears on invalidation', () => {
    vi.useFakeTimers();
    try {
      const cache = new CatalogueCacheService();
      cache.set('k1', { count: 10 }, 5000);
      expect(cache.get<{ count: number }>('k1')).toEqual({ count: 10 });

      vi.advanceTimersByTime(6000);
      expect(cache.get('k1')).toBeUndefined();

      for (let i = 0; i < 260; i += 1) {
        cache.set(`item-${i}`, i);
      }
      expect(cache.size()).toBe(250);
      expect(cache.get('item-0')).toBeUndefined();
      expect(cache.get('item-259')).toBe(259);

      cache.invalidateAll();
      expect(cache.size()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
