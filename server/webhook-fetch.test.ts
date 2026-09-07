import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { fetchWebhookWithTimeout } from "./webhook-fetch.js";

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

test("returns the response body from a responding webhook endpoint", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  try {
    const url = await listen(server);
    const response = await fetchWebhookWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: "case_1" }),
    }, 2000);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    server.close();
  }
});

test("non-2xx statuses are returned without throwing", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(502);
    res.end();
  });
  try {
    const url = await listen(server);
    const response = await fetchWebhookWithTimeout(url, {}, 2000);
    assert.equal(response.status, 502);
  } finally {
    server.close();
  }
});

test("a stalled endpoint aborts within the configured timeout", async () => {
  const server = createServer((_req, _res) => {
    // Never respond: a stalled webhook must not hold the caller open indefinitely.
  });
  try {
    const url = await listen(server);
    const started = Date.now();
    await assert.rejects(
      () => fetchWebhookWithTimeout(url, {}, 200),
      (error: unknown) => {
        const name = (error as { name?: string }).name;
        return name === "AbortError" || name === "TimeoutError";
      },
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 150, `aborted too early: ${elapsed}ms`);
    assert.ok(elapsed < 2000, `did not abort promptly: ${elapsed}ms`);
  } finally {
    server.close();
  }
});

test("a caller-provided abort signal also terminates an in-flight request", async () => {
  const server = createServer((_req, _res) => {
    // Never respond.
  });
  try {
    const url = await listen(server);
    const controller = new AbortController();
    const settled = fetchWebhookWithTimeout(url, { signal: controller.signal }, 2000).catch((error: unknown) => error);
    controller.abort();
    const outcome = await settled;
    assert.equal(["AbortError", "TimeoutError"].includes((outcome as { name?: string }).name ?? ""), true);
  } finally {
    server.close();
  }
});