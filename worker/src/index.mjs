const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 5;
const MAX_REQUEST_BYTES = 4096;
const ANSWERS = Object.freeze({
  yes: "Yes! They said they like you too.",
  no: "No, thank you. They chose the honest no option.",
  chance: "They'll give you a chance.",
  friends: "They'd like to be friends."
});

function jsonResponse(body, status, origin) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "600");
    headers.append("Vary", "Origin");
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

async function readJsonLimited(request) {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new RangeError("Request body is too large.");
  }
  if (!request.body) throw new SyntaxError("A JSON body is required.");

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new RangeError("Request body is too large.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

async function hashClientAddress(address, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(address));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(token, secret, remoteAddress, expectedHostname) {
  const form = new URLSearchParams({ secret, response: token, remoteip: remoteAddress });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return false;

  const result = await response.json();
  return result.success === true
    && result.hostname === expectedHostname
    && result.action === "confession_answer";
}

async function sendEmail(answer, receivedAt, env) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [env.EMAIL_TO],
      subject: "A confession website answer",
      text: `Answer: ${answer}\nReceived: ${receivedAt}`
    }),
    signal: AbortSignal.timeout(8000)
  });
  return response.ok;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigin = env.ALLOWED_ORIGIN;
    const corsOrigin = origin === allowedOrigin ? allowedOrigin : "";

    if (!allowedOrigin || origin !== allowedOrigin) {
      return jsonResponse({ error: "origin_not_allowed" }, 403, "");
    }
    if (request.method === "OPTIONS") {
      return jsonResponse({}, 204, corsOrigin);
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405, corsOrigin);
    }
    if (new URL(request.url).pathname !== "/answer") {
      return jsonResponse({ error: "not_found" }, 404, corsOrigin);
    }
    const contentType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      return jsonResponse({ error: "content_type_must_be_json" }, 415, corsOrigin);
    }

    let payload;
    try {
      payload = await readJsonLimited(request);
    } catch (error) {
      const tooLarge = error instanceof RangeError;
      return jsonResponse({ error: tooLarge ? "request_too_large" : "invalid_json" }, tooLarge ? 413 : 400, corsOrigin);
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || Object.keys(payload).some((key) => !["answer", "turnstileToken"].includes(key))
      || !Object.hasOwn(ANSWERS, payload.answer)
      || typeof payload.turnstileToken !== "string"
      || payload.turnstileToken.length < 1
      || payload.turnstileToken.length > 2048) {
      return jsonResponse({ error: "invalid_submission" }, 400, corsOrigin);
    }

    const remoteAddress = request.headers.get("CF-Connecting-IP");
    const expectedHostname = new URL(allowedOrigin).hostname;
    if (!remoteAddress || !env.RATE_LIMIT_HMAC_KEY || env.RATE_LIMIT_HMAC_KEY.length < 32
      || !env.TURNSTILE_SECRET || !env.RESEND_API_KEY || !env.EMAIL_TO || !env.EMAIL_FROM
      || env.EMAIL_FROM.includes("your-verified-domain.example")
      || !env.RATE_LIMITER) {
      return jsonResponse({ error: "service_not_configured" }, 503, corsOrigin);
    }

    let allowedByRateLimit;
    try {
      const key = await hashClientAddress(remoteAddress, env.RATE_LIMIT_HMAC_KEY);
      const id = env.RATE_LIMITER.idFromName(key);
      const limiter = env.RATE_LIMITER.get(id);
      const result = await limiter.fetch("https://rate-limit.internal/check", { method: "POST" });
      allowedByRateLimit = result.status === 200;
    } catch {
      return jsonResponse({ error: "rate_limit_unavailable" }, 503, corsOrigin);
    }
    if (!allowedByRateLimit) {
      return jsonResponse({ error: "rate_limited" }, 429, corsOrigin);
    }

    let verified;
    try {
      verified = await verifyTurnstile(
        payload.turnstileToken,
        env.TURNSTILE_SECRET,
        remoteAddress,
        expectedHostname
      );
    } catch {
      return jsonResponse({ error: "verification_unavailable" }, 503, corsOrigin);
    }
    if (!verified) {
      return jsonResponse({ error: "verification_failed" }, 403, corsOrigin);
    }

    try {
      const sent = await sendEmail(ANSWERS[payload.answer], new Date().toISOString(), env);
      if (!sent) return jsonResponse({ error: "email_delivery_failed" }, 502, corsOrigin);
    } catch {
      return jsonResponse({ error: "email_delivery_failed" }, 502, corsOrigin);
    }

    return jsonResponse({ success: true }, 200, corsOrigin);
  }
};

export class RateLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method !== "POST") return new Response(null, { status: 405 });

    const now = Date.now();
    const windowId = Math.floor(now / RATE_WINDOW_MS);
    const previous = await this.state.storage.get("rate");
    const count = previous?.windowId === windowId ? previous.count : 0;
    if (count >= RATE_LIMIT) return new Response(null, { status: 429 });

    await this.state.storage.put("rate", { windowId, count: count + 1 });
    await this.state.storage.setAlarm((windowId + 1) * RATE_WINDOW_MS);
    return new Response(null, { status: 200 });
  }

  async alarm() {
    await this.state.storage.delete("rate");
  }
}
