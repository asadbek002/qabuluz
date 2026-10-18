// Simple in-memory fixed-window limiter. Good enough for a single web container;
// counters reset when the process restarts.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

/** Client IP as forwarded by the reverse proxy (Nginx sets X-Real-IP). */
export function clientIp(headers: Headers) {
  return headers.get("x-real-ip")?.trim()
    || headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || "unknown";
}
