import assert from "node:assert/strict";
import test from "node:test";
import worker, { RateLimiter } from "../src/index.mjs";

const origin = "https://shoyoremejy-pixel.github.io";
const env = {
  ALLOWED_ORIGIN: origin,
  EMAIL_FROM: "Confession site <hello@example.com>",
  EMAIL_TO: "owner@example.com",
  RATE_LIMIT_HMAC_KEY: "a-secret-key-with-at-least-32-characters",
  RESEND_API_KEY: "test-resend-key",
  TURNSTILE_SECRET: "test-turnstile-secret",
  RATE_LIMITER: {
    idFromName: (key) => key,
    get: () => ({ fetch: async () => new Response(null, { status: 200 }) })
  }
};

function submission(answer = "yes", token = "turnstile-token", headers = {}) {
  return new Request("https://api.example.workers.dev/answer", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.20",
      ...headers
    },
    body: JSON.stringify({ answer, turnstileToken: token })
  });
}

async function withFetch(mock, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("rejects requests from other origins before contacting services", async () => {
  await withFetch(async () => {
    throw new Error("External services must not be called.");
  }, async () => {
    const response = await worker.fetch(submission("yes", "token", { Origin: "https://attacker.example" }), env);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  });
});

test("answers valid preflight requests with the exact allowed origin", async () => {
  const response = await worker.fetch(new Request("https://api.example.workers.dev/answer", {
    method: "OPTIONS",
    headers: { Origin: origin }
  }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
});

test("rejects unknown answers without contacting services", async () => {
  await withFetch(async () => {
    throw new Error("External services must not be called.");
  }, async () => {
    const response = await worker.fetch(submission("free-form text"), env);
    assert.equal(response.status, 400);
  });
});

test("rejects oversized JSON bodies", async () => {
  const response = await worker.fetch(new Request("https://api.example.workers.dev/answer", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.20"
    },
    body: "x".repeat(5000)
  }), env);
  assert.equal(response.status, 413);
});

test("sends only an allow-listed answer after Turnstile verification", async () => {
  const calls = [];
  await withFetch(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("siteverify")) {
      return Response.json({
        success: true,
        hostname: "shoyoremejy-pixel.github.io",
        action: "confession_answer"
      });
    }
    return Response.json({ id: "email_123" });
  }, async () => {
    const response = await worker.fetch(submission("no"), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    assert.equal(calls.length, 2);

    const email = JSON.parse(calls[1].options.body);
    assert.deepEqual(email.to, ["owner@example.com"]);
    assert.match(email.text, /^Answer: No, thank you\./);
    assert.equal(email.from, env.EMAIL_FROM);
    assert.equal(calls[1].options.headers.Authorization, `Bearer ${env.RESEND_API_KEY}`);
  });
});

test("rejects a Turnstile token for another host and does not send email", async () => {
  const calls = [];
  await withFetch(async (url) => {
    calls.push(String(url));
    return Response.json({
      success: true,
      hostname: "attacker.example",
      action: "confession_answer"
    });
  }, async () => {
    const response = await worker.fetch(submission("yes"), env);
    assert.equal(response.status, 403);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /siteverify/);
  });
});

test("rejects requests blocked by the Durable Object rate limiter", async () => {
  const limitedEnv = {
    ...env,
    RATE_LIMITER: {
      idFromName: (key) => key,
      get: () => ({ fetch: async () => new Response(null, { status: 429 }) })
    }
  };
  await withFetch(async () => {
    throw new Error("Email services must not be called.");
  }, async () => {
    const response = await worker.fetch(submission(), limitedEnv);
    assert.equal(response.status, 429);
  });
});

test("fails closed when server secrets are missing", async () => {
  await withFetch(async () => {
    throw new Error("External services must not be called.");
  }, async () => {
    const response = await worker.fetch(submission(), { ...env, RESEND_API_KEY: "" });
    assert.equal(response.status, 503);
  });
});

test("Durable Object permits five requests per hour and rejects the next", async () => {
  const values = new Map();
  let alarmAt;
  const limiter = new RateLimiter({
    storage: {
      get: async (key) => values.get(key),
      put: async (key, value) => values.set(key, value),
      setAlarm: async (time) => { alarmAt = time; },
      delete: async (key) => values.delete(key)
    }
  });
  const originalNow = Date.now;
  Date.now = () => 1_800_000_000_000;
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await limiter.fetch(new Request("https://rate-limit.internal/check", { method: "POST" }));
      assert.equal(response.status, 200);
    }
    assert.equal(alarmAt, (Math.floor(Date.now() / 3_600_000) + 1) * 3_600_000);
    const blocked = await limiter.fetch(new Request("https://rate-limit.internal/check", { method: "POST" }));
    assert.equal(blocked.status, 429);
    await limiter.alarm();
    assert.equal(values.has("rate"), false);
  } finally {
    Date.now = originalNow;
  }
});
