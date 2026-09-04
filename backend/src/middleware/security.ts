import { Request, Response, NextFunction } from 'express';
import { AuthedRequest } from './auth';

/**
 * Baseline security headers.
 *
 * The Content-Security-Policy allows Google's identity and Firebase hosts
 * because sign-in runs in a popup served from those origins. It intentionally
 * does not allow arbitrary third-party script.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://securetoken.googleapis.com",
      "frame-src https://accounts.google.com https://*.firebaseapp.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Per-user rate limiting for the expensive AI endpoints.
 *
 * This is deliberately in-memory: it protects a single Cloud Run instance
 * from one account issuing runaway requests, which is the realistic abuse
 * case here. It is NOT a distributed limit — with several instances running,
 * a determined caller gets the limit multiplied by the instance count. A
 * production deployment would move this to Redis or Cloud Armor.
 */
export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const key = req.uid || req.ip || 'anonymous';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (bucket.count >= maxRequests) {
      const seconds = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(seconds));
      res.status(429).json({
        error: `That's a lot of requests at once. Please wait ${seconds} seconds and try again.`,
      });
      return;
    }

    bucket.count += 1;
    next();
  };
}

/** Stops the bucket map growing without bound on a long-lived instance. */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 60_000).unref();
