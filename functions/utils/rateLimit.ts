/**
 * Rate limiting utility for API endpoints
 * Uses D1 database to track request counts per user/IP
 */

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyPrefix: string; // Prefix for the rate limit key (e.g., 'llm_generate')
}

export interface RateLimitEnv {
  USERS_DB?: D1Database;
}

interface RateLimitRecord {
  key: string;
  count: number;
  window_start: string;
}

/**
 * Check if a request should be rate limited
 * @returns true if request should be allowed, false if rate limited
 */
export const checkRateLimit = async (
  env: RateLimitEnv,
  identifier: string, // user ID, session token, or IP address
  config: RateLimitConfig
): Promise<{ allowed: boolean; remainingRequests: number; resetAt: Date }> => {
  if (!env.USERS_DB) {
    // If no database, allow request (graceful degradation)
    return { allowed: true, remainingRequests: config.maxRequests, resetAt: new Date(Date.now() + config.windowMs) };
  }

  const now = Date.now();
  const key = `${config.keyPrefix}:${identifier}`;

  try {
    // Get or create rate limit record
    const record = await env.USERS_DB.prepare(
      `SELECT key, count, window_start FROM rate_limits WHERE key = ?`
    ).bind(key).first<RateLimitRecord>();

    if (!record) {
      // First request in this window
      await env.USERS_DB.prepare(
        `INSERT INTO rate_limits (key, count, window_start, created_at) VALUES (?, 1, ?, ?)`
      ).bind(key, new Date(now).toISOString(), new Date().toISOString()).run();

      return {
        allowed: true,
        remainingRequests: config.maxRequests - 1,
        resetAt: new Date(now + config.windowMs)
      };
    }

    const windowStart = new Date(record.window_start).getTime();
    const windowEnd = windowStart + config.windowMs;

    if (now > windowEnd) {
      // Window has expired, reset counter
      await env.USERS_DB.prepare(
        `UPDATE rate_limits SET count = 1, window_start = ? WHERE key = ?`
      ).bind(new Date(now).toISOString(), key).run();

      return {
        allowed: true,
        remainingRequests: config.maxRequests - 1,
        resetAt: new Date(now + config.windowMs)
      };
    }

    // Window is still active
    if (record.count >= config.maxRequests) {
      // Rate limit exceeded
      return {
        allowed: false,
        remainingRequests: 0,
        resetAt: new Date(windowEnd)
      };
    }

    // Increment counter
    await env.USERS_DB.prepare(
      `UPDATE rate_limits SET count = count + 1 WHERE key = ?`
    ).bind(key).run();

    return {
      allowed: true,
      remainingRequests: config.maxRequests - record.count - 1,
      resetAt: new Date(windowEnd)
    };
  } catch (err) {
    console.error('[RateLimit] Error checking rate limit:', err);
    // On error, allow request (fail open for availability)
    return { allowed: true, remainingRequests: config.maxRequests, resetAt: new Date(Date.now() + config.windowMs) };
  }
};

/**
 * Clean up expired rate limit records
 * Should be called periodically (e.g., via cron or on each request)
 */
export const cleanupExpiredRateLimits = async (env: RateLimitEnv): Promise<void> => {
  if (!env.USERS_DB) return;

  try {
    // Delete records older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await env.USERS_DB.prepare(
      `DELETE FROM rate_limits WHERE window_start < ?`
    ).bind(cutoff).run();
  } catch (err) {
    console.error('[RateLimit] Error cleaning up rate limits:', err);
  }
};

/**
 * Get client identifier from request (user ID or IP address)
 */
export const getClientIdentifier = (request: Request, userId?: number): string => {
  // Prefer user ID if authenticated
  if (userId) {
    return `user:${userId}`;
  }

  // Fall back to IP address
  const cfConnectingIp = request.headers.get('CF-Connecting-IP');
  const xForwardedFor = request.headers.get('X-Forwarded-For');
  const ip = cfConnectingIp || xForwardedFor?.split(',')[0] || 'unknown';

  return `ip:${ip}`;
};
