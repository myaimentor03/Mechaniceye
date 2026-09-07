import { createHmac } from "node:crypto";

const SESSION_TTL_SECONDS = 60 * 60 * 12;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

export function mintSessionToken({ id, email, secret, now = Date.now(), ttlSeconds = SESSION_TTL_SECONDS }) {
  if (!secret || secret.length < 32) {
    throw new Error("DRIVABLE_SESSION_SECRET must contain at least 32 characters");
  }
  const payload = base64url(JSON.stringify({ id, email, exp: Math.floor(now / 1000) + ttlSeconds, v: 1 }));
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function sessionCookieHeader({ id, email, secret, now = Date.now(), ttlSeconds = SESSION_TTL_SECONDS }) {
  const token = mintSessionToken({ id, email, secret, now, ttlSeconds });
  return `drivable_session=${encodeURIComponent(token)}`;
}