// Sliding-window rate limiting (AUDIT S1). In-memory by design for the
// single-instance deployment — all limiter state lives in this one module so
// a Redis-backed store is a drop-in swap when the app scales (AUDIT S8).
import { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/errors";
import { emailHash, logger } from "../lib/logger";

interface Window {
  times: number[];
}

const buckets = new Map<string, Window>();

function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const w = buckets.get(key) ?? { times: [] };
  w.times = w.times.filter((t) => now - t < windowMs);
  if (w.times.length >= max) {
    buckets.set(key, w);
    return false;
  }
  w.times.push(now);
  buckets.set(key, w);
  return true;
}

/** Test hook — clears all limiter state. */
export function resetAllRateLimits() {
  buckets.clear();
}

/**
 * Auth throttle: per-IP (catches distributed guessing against one IP) AND
 * per-email (catches one account attacked from many IPs). The email key is
 * hashed — raw addresses never sit in server memory keys or logs.
 */
export function authRateLimit(opts: {
  scope: string;
  maxPerIp: number;
  maxPerEmail: number;
  windowMs: number;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ip = req.ip ?? "unknown";
    const email =
      typeof (req.body as { email?: unknown })?.email === "string"
        ? (req.body as { email: string }).email
        : null;

    const ipOk = hit(`${opts.scope}:ip:${ip}`, opts.maxPerIp, opts.windowMs);
    const emailOk =
      !email ||
      hit(
        `${opts.scope}:email:${emailHash(email)}`,
        opts.maxPerEmail,
        opts.windowMs,
      );

    if (!ipOk || !emailOk) {
      logger.warn(
        {
          event: "auth.rate_limited",
          scope: opts.scope,
          ip,
          user: email ? emailHash(email) : undefined,
        },
        "rate limit tripped",
      );
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Too many attempts — please wait a few minutes and try again.",
      );
    }
    next();
  };
}
