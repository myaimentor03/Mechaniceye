import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { Express, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { users } from "./shared/shared/schema";
import { createRateLimit, requestIp } from "./rate-limit";
import { logEventError } from "./observability/safe-log";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "drivable_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
export const SESSION_SECRET_ENV = "DRIVABLE_SESSION_SECRET";
export const BETA_INVITE_ENV = "DRIVABLE_BETA_INVITE_CODE";

type CustomerIdentity = { id: string; email: string };

export type RegistrationDecision =
  | { kind: "created"; user: CustomerIdentity }
  | { kind: "existing" };

/**
 * Maps a registration decision to its HTTP response. The status and body are
 * identical for both outcomes so an unauthenticated caller cannot tell whether
 * an email already has an account. A session is only issued for a newly created
 * account, via the route, and is never reflected in the body.
 */
export function registrationHttpResponse(decision: RegistrationDecision): {
  status: number;
  body: Readonly<{ ok: true }>;
  sessionUser?: CustomerIdentity;
} {
  return {
    status: 200,
    body: Object.freeze({ ok: true }),
    ...(decision.kind === "created" ? { sessionUser: decision.user } : {}),
  };
}

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
});

const registrationSchema = credentialsSchema.extend({ inviteCode: z.string().trim().min(1).max(128) });

declare global {
  namespace Express {
    interface Request {
      drivableCustomer?: CustomerIdentity;
    }
  }
}

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function configuredSecret() {
  const secret = process.env[SESSION_SECRET_ENV]?.trim() || "";
  return secret.length >= 32 ? secret : "";
}

export function inviteMatches(candidate: unknown, configured = process.env[BETA_INVITE_ENV]): boolean {
  const left = Buffer.from(typeof candidate === "string" ? candidate.trim() : "");
  const right = Buffer.from(typeof configured === "string" ? configured.trim() : "");
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${base64url(salt)}$${base64url(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltText, hashText] = stored.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, "base64url");
    const actual = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createSessionToken(identity: CustomerIdentity, now = Date.now()): string {
  const secret = configuredSecret();
  if (!secret) throw new Error(`${SESSION_SECRET_ENV} must contain at least 32 characters`);
  const payload = base64url(JSON.stringify({ ...identity, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS, v: 1 }));
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readSessionToken(token: string, now = Date.now()): CustomerIdentity | null {
  const secret = configuredSecret();
  const [payload, suppliedSignature] = token.split(".");
  if (!secret || !payload || !suppliedSignature) return null;
  const expectedSignature = createHmac("sha256", secret).update(payload).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(suppliedSignature, "base64url"); } catch { return null; }
  if (supplied.length !== expectedSignature.length || !timingSafeEqual(supplied, expectedSignature)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (decoded?.v !== 1 || typeof decoded.id !== "string" || typeof decoded.email !== "string") return null;
    if (!Number.isInteger(decoded.exp) || decoded.exp <= Math.floor(now / 1000)) return null;
    return { id: decoded.id, email: decoded.email };
  } catch {
    return null;
  }
}

function cookieValue(header: unknown): string {
  if (typeof header !== "string") return "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function setSessionCookie(res: any, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`);
}

function clearSessionCookie(res: any) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export const optionalCustomer: RequestHandler = (req, _res, next) => {
  const identity = readSessionToken(cookieValue(req.headers.cookie));
  if (identity) req.drivableCustomer = identity;
  next();
};

export const requireCustomer: RequestHandler = (req, res, next) => {
  const secret = configuredSecret();
  if (!secret) {
    res.status(503).json({ ok: false, error: "Customer accounts are not configured.", code: "CUSTOMER_AUTH_NOT_CONFIGURED" });
    return;
  }
  const identity = readSessionToken(cookieValue(req.headers.cookie));
  if (!identity) {
    res.status(401).json({ ok: false, error: "Please sign in to continue.", code: "CUSTOMER_AUTH_REQUIRED" });
    return;
  }
  req.drivableCustomer = identity;
  res.setHeader("Cache-Control", "no-store");
  next();
};

export function registerCustomerAuthRoutes(app: Express) {
  const registrationLimit = createRateLimit({ scope: "auth-register", windowMs: 15 * 60_000, max: 8 });
  const loginIpLimit = createRateLimit({ scope: "auth-login-ip", windowMs: 15 * 60_000, max: 20 });
  const loginAccountLimit = createRateLimit({
    scope: "auth-login-account",
    windowMs: 15 * 60_000,
    max: 10,
    key: (req) => `${requestIp(req)}:${String(req.body?.email || "").trim().toLowerCase()}`,
  });

  app.post("/api/auth/register", registrationLimit, async (req, res) => {
    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: "Use the beta invite code, a valid email, and a password of at least 12 characters." });
    if (!configuredSecret()) return res.status(503).json({ ok: false, error: "Customer accounts are not configured." });
    if (!process.env[BETA_INVITE_ENV]?.trim()) return res.status(503).json({ ok: false, error: "Beta invitations are not configured." });
    if (!inviteMatches(parsed.data.inviteCode)) return res.status(403).json({ ok: false, error: "This beta invite code is not valid." });
    let decision: RegistrationDecision = { kind: "existing" };
    try {
      const [created] = await getDb()
        .insert(users)
        .values({ username: parsed.data.email, password: await hashPassword(parsed.data.password) })
        .onConflictDoNothing({ target: users.username })
        .returning({ id: users.id, email: users.username });
      decision = created ? { kind: "created", user: created } : { kind: "existing" };
    } catch (error) {
      logEventError("auth.register_failed", error, { ip: requestIp(req) });
      return res.status(503).json({ ok: false, error: "Account creation is temporarily unavailable." });
    }
    // Enumeration-safe: the status and body are identical whether the email is
    // brand new or already registered. No session is minted for existing
    // accounts, so the two outcomes cannot be told apart.
    const response = registrationHttpResponse(decision);
    if (response.sessionUser) setSessionCookie(res, createSessionToken(response.sessionUser));
    res.setHeader("Cache-Control", "no-store");
    return res.status(response.status).json(response.body);
  });

  app.post("/api/auth/login", loginIpLimit, loginAccountLimit, async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success || !configuredSecret()) return res.status(401).json({ ok: false, error: "Invalid email or password." });
    try {
      const [record] = await getDb().select({ id: users.id, email: users.username, password: users.password }).from(users).where(eq(users.username, parsed.data.email)).limit(1);
      if (!record || !(await verifyPassword(parsed.data.password, record.password))) return res.status(401).json({ ok: false, error: "Invalid email or password." });
      const user = { id: record.id, email: record.email };
      setSessionCookie(res, createSessionToken(user));
      return res.json({ ok: true, user });
    } catch (error) {
      logEventError("auth.login_failed", error, { ip: requestIp(req) });
      return res.status(503).json({ ok: false, error: "Sign in is temporarily unavailable." });
    }
  });

  app.get("/api/auth/me", optionalCustomer, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, user: req.drivableCustomer || null });
  });

  app.post("/api/auth/logout", (_req, res) => {
    clearSessionCookie(res);
    return res.json({ ok: true });
  });
}
