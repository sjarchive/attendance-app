import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, pruneRateLimits } from "./rate-limit";

test("checkRateLimit enforces limit within window and resets after expiry", () => {
  const key = "test-login-" + Math.random();
  assert.equal(checkRateLimit(key, 2, 1000).ok, true);
  assert.equal(checkRateLimit(key, 2, 1000).ok, true);
  const blocked = checkRateLimit(key, 2, 1000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
  pruneRateLimits(Date.now() + 2000);
  assert.equal(checkRateLimit(key, 2, 1000).ok, true);
});
