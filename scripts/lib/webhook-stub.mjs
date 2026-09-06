import http from "node:http";

export function createWebhookStub() {
  const received = [];
  let failNext = false;
  let failAlways = false;

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks);
      const bodyText = rawBody.toString("utf8");
      const contentType = req.headers["content-type"] || "";

      let parsed = null;
      if (contentType.includes("application/json") && bodyText) {
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          parsed = { parseError: true, raw: bodyText.slice(0, 500) };
        }
      }

      received.push({
        method: req.method,
        url: req.url,
        path: new URL(req.url, "http://localhost").pathname,
        headers: { ...req.headers },
        rawBody: bodyText,
        body: parsed,
        at: Date.now(),
      });

      if (failAlways || failNext) {
        failNext = false;
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "simulated webhook failure" }));
      }

      if (req.url === "/health" || req.url === "/health/") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true }));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, received: received.length }));
    });
  });

  return {
    server,
    received,
    listener: null,
    setFailNext() {
      failNext = true;
    },
    setFailAlways(value) {
      failAlways = Boolean(value);
    },
    getReceivesFor(pathname) {
      return received.filter((entry) => entry.path === pathname);
    },
    start() {
      return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          this.listener = server.address();
          resolve(`http://127.0.0.1:${this.listener.port}`);
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}