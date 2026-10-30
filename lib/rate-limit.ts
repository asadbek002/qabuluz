// Simple in-memory fixed-window limiter. Good enough for a single web container;
// counters reset when the process restarts.
const buckets = new Map<string, { count: number; resetAt: number }>();

function sweep(now: number) {
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
}

/** Count one hit and tell whether the key is still within `limit` hits per window. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

let warnedNoIp = false;

/** Client IP as forwarded by the reverse proxy (Nginx sets X-Real-IP). */
export function clientIp(headers: Headers) {
  const ip = headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  if (!ip && !warnedNoIp && process.env.NODE_ENV === "production") {
    // Without it every visitor shares one "unknown" bucket and the limits become site-wide.
    warnedNoIp = true;
    console.warn("rate-limit: no X-Real-IP header; add `proxy_set_header X-Real-IP $remote_addr;` to the Nginx location.");
  }
  return ip || "unknown";
}
