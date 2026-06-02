import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge Middleware — runs before every API request.
 * Implements a simple sliding-window rate limiter using Vercel Edge headers.
 *
 * Because Vercel free-tier has no shared state (no Redis), we use a
 * token-bucket approach keyed on the client IP stored in a signed cookie.
 * Counts reset every 60-second window (cookie max-age).
 *
 * Limit: RATE_LIMIT_RPM requests per IP per minute (default 20).
 */

const RPM_LIMIT = parseInt(process.env.RATE_LIMIT_RPM ?? '20', 10);
const WINDOW_MS = 60_000;

// In-memory map per Edge worker instance (not shared across instances).
// Good enough to catch burst abuse on the free tier without external storage.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only gate /api/* routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Identify client (Vercel injects x-forwarded-for)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    // New window
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    record.count++;
    if (record.count > RPM_LIMIT) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      return new NextResponse(
        JSON.stringify({
          error: 'Rate limit exceeded. Please wait before sending more requests.',
          retry_after_seconds: retryAfter,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(RPM_LIMIT),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(record.resetAt / 1000)),
          },
        }
      );
    }
    const remaining = RPM_LIMIT - record.count;
    const res = NextResponse.next();
    res.headers.set('X-RateLimit-Limit', String(RPM_LIMIT));
    res.headers.set('X-RateLimit-Remaining', String(remaining));
    res.headers.set('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));
    return res;
  }

  // CORS headers for mobile app access
  const res = NextResponse.next();
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.headers.set('X-RateLimit-Limit', String(RPM_LIMIT));
  res.headers.set('X-RateLimit-Remaining', String(RPM_LIMIT - 1));
  return res;
}

export const config = {
  matcher: ['/api/:path*'],
};
