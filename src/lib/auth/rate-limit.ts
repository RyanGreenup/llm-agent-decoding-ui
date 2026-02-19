// Application-level login rate limiting. Caddy's rate_limit zones only match
// POST /login, but SolidStart JS-enhanced actions post to /_server instead,
// so browser-driven brute force (e.g. Playwright) bypasses the proxy layer.
// See deploy/caddy/Caddyfile [fn_1].
import { RateLimiterMemory } from "rate-limiter-flexible";

const IP_DAILY_POINTS = 100;
const IP_DAILY_DURATION = 60 * 60 * 24; // 24 hours
const IP_DAILY_BLOCK_DURATION = 60 * 60 * 24; // 24 hours

const CONSECUTIVE_POINTS = 10;
const CONSECUTIVE_DURATION = 60 * 60 * 24 * 24; // 24 days (RateLimiterMemory setTimeout max)
const CONSECUTIVE_BLOCK_DURATION = 60 * 60; // 1 hour

const ipDailyLimiter = new RateLimiterMemory({
  keyPrefix: "login_ip_daily",
  points: IP_DAILY_POINTS,
  duration: IP_DAILY_DURATION,
  blockDuration: IP_DAILY_BLOCK_DURATION,
});

const consecutiveLimiter = new RateLimiterMemory({
  keyPrefix: "login_consecutive",
  points: CONSECUTIVE_POINTS,
  duration: CONSECUTIVE_DURATION,
  blockDuration: CONSECUTIVE_BLOCK_DURATION,
});

export async function checkLoginRateLimit(
  ip: string,
  username: string,
): Promise<{ blocked: boolean; retrySecs: number }> {
  const [ipRes, consRes] = await Promise.all([
    ipDailyLimiter.get(ip),
    consecutiveLimiter.get(`${username}_${ip}`),
  ]);

  if (ipRes !== null && ipRes.consumedPoints > IP_DAILY_POINTS) {
    return {
      blocked: true,
      retrySecs: Math.round(ipRes.msBeforeNext / 1000) || 1,
    };
  }
  if (consRes !== null && consRes.consumedPoints > CONSECUTIVE_POINTS) {
    return {
      blocked: true,
      retrySecs: Math.round(consRes.msBeforeNext / 1000) || 1,
    };
  }

  return { blocked: false, retrySecs: 0 };
}

export async function penalizeFailedLogin(
  ip: string,
  username: string,
): Promise<void> {
  try {
    await Promise.all([
      ipDailyLimiter.consume(ip),
      consecutiveLimiter.consume(`${username}_${ip}`),
    ]);
  } catch (rlRejected) {
    // consume rejects with RateLimiterRes when limit is exceeded — that's
    // expected (it triggers blockDuration). Re-throw only real errors.
    if (rlRejected instanceof Error) throw rlRejected;
  }
}

export async function resetOnSuccess(
  ip: string,
  username: string,
): Promise<void> {
  const key = `${username}_${ip}`;
  const res = await consecutiveLimiter.get(key);
  if (res !== null && res.consumedPoints > 0) {
    await consecutiveLimiter.delete(key);
  }
}
