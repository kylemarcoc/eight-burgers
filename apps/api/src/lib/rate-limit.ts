export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const DEFAULT_MAX_BUCKETS = 10_000;

export function extractClientIp(headers: Headers, trustProxy: boolean): string {
  if (!trustProxy) {
    return 'direct';
  }
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get('x-real-ip')?.trim();
  return realIp || 'direct';
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly maxBuckets: number = DEFAULT_MAX_BUCKETS,
  ) {}

  get bucketCount(): number {
    return this.buckets.size;
  }

  private evictIfNeeded(cutoff: number): void {
    if (this.buckets.size < this.maxBuckets) return;

    for (const [existingKey, timestamps] of this.buckets) {
      const latest = timestamps[timestamps.length - 1];
      if (latest === undefined || latest <= cutoff) {
        this.buckets.delete(existingKey);
      }
    }

    while (this.buckets.size >= this.maxBuckets) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey === undefined) break;
      this.buckets.delete(oldestKey);
    }
  }

  check(key: string): RateLimitDecision {
    const current = this.now();
    const cutoff = current - this.windowMs;
    const entries = this.buckets.get(key) ?? [];
    const active = entries.filter((timestamp) => timestamp > cutoff);

    if (!this.buckets.has(key)) {
      this.evictIfNeeded(cutoff);
    } else {
      this.buckets.delete(key);
    }

    if (active.length >= this.maxRequests) {
      const oldest = active[0] ?? current;
      const retryAfterMs = Math.max(1000, oldest + this.windowMs - current);
      this.buckets.set(key, active);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }

    active.push(current);
    this.buckets.set(key, active);
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - active.length),
      retryAfterSeconds: 0,
    };
  }

  reset(): void {
    this.buckets.clear();
  }
}
