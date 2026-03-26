import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimitByKey(opts: { windowMs: number; max: number; keyFn: (req: Request) => string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = opts.keyFn(req);
    const now = Date.now();

    const b = buckets.get(key);
    if (!b || now > b.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      if (buckets.size > 10_000) {
        for (const [k, v] of buckets) {
          if (now > v.resetAt) buckets.delete(k);
          if (buckets.size <= 8_000) break;
        }
      }
      return next();
    }

    b.count += 1;
    if (b.count > opts.max) return res.sendStatus(429);

    return next();
  };
}
