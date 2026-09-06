import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { DRIVABLE_ALLOWED_ORIGINS, enforceOriginForStateChanging, originPermitted, requireAllowedOrigin } from "./origin-guard.js";

test("allowlist contains the production frontend and local dev origins", () => {
  assert.deepEqual(
    [...DRIVABLE_ALLOWED_ORIGINS].sort(),
    ["http://127.0.0.1:5173", "http://localhost:5173", "https://mechaniceye.onrender.com"].sort(),
  );
});

test("originPermitted accepts list members and rejects everything else", () => {
  assert.equal(originPermitted("https://mechaniceye.onrender.com"), true);
  assert.equal(originPermitted("http://localhost:5173"), true);
  assert.equal(originPermitted("http://127.0.0.1:5173"), true);
  assert.equal(originPermitted("https://evil.example.com"), false);
  assert.equal(originPermitted("https://mechaniceye.onrender.com.evil.example.com"), false);
  assert.equal(originPermitted(""), false);
  assert.equal(originPermitted(undefined), false);
});

test("requireAllowedOrigin allows list members and no-origin requests", async () => {
  const app = express();
  app.use(express.json());
  let reached = false;
  app.post("/submit", requireAllowedOrigin, (req, res) => {
    reached = true;
    res.json({ ok: true });
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const allowed = await fetch(`${origin}/submit`, {
      method: "POST",
      headers: { origin: "https://mechaniceye.onrender.com", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(allowed.status, 200);

    const noOrigin = await fetch(`${origin}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(noOrigin.status, 200);
    assert.equal(reached, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("requireAllowedOrigin rejects disallowed origins with 403 for state-changing calls", async () => {
  const app = express();
  app.use(express.json());
  app.post("/submit", requireAllowedOrigin, (req, res) => res.json({ ok: true }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${origin}/submit`, {
      method: "POST",
      headers: {
        origin: "https://attacker.example.com",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.deepEqual(body, { ok: false, error: "Request origin is not allowed.", code: "ORIGIN_NOT_ALLOWED" });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("enforceOriginForStateChanging rejects disallowed state changes but lets reads through", async () => {
  const app = express();
  app.use(express.json());
  app.use(enforceOriginForStateChanging);
  let reached = false;
  app.get("/read", (_req, res) => { reached = true; res.json({ ok: true }); });
  app.post("/write", (req, res) => { reached = true; res.json({ ok: true }); });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const evil = { origin: "https://attacker.example.com" };

    const readResponse = await fetch(`${origin}/read`, { method: "GET", headers: evil });
    assert.equal(readResponse.status, 200);
    assert.equal(reached, true);

    reached = false;
    const writeResponse = await fetch(`${origin}/write`, {
      method: "POST",
      headers: { ...evil, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(writeResponse.status, 403);
    assert.equal(reached, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("enforceOriginForStateChanging allows allow-listed origins and no-origin writes", async () => {
  const app = express();
  app.use(express.json());
  app.use(enforceOriginForStateChanging);
  app.post("/write", (_req, res) => res.json({ ok: true }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const allowed = await fetch(`${origin}/write`, {
      method: "POST",
      headers: { origin: "https://mechaniceye.onrender.com", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(allowed.status, 200);

    const noOrigin = await fetch(`${origin}/write`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(noOrigin.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});