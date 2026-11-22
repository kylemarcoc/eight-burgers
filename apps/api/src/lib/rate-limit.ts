export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  check(key: string): RateLimitDecision {
    const current = this.now();
    const cutoff = current - this.windowMs;
    const entries = this.buckets.get(key) ?? [];
    const active = entries.filter((timestamp) => timestamp > cutoff);

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
