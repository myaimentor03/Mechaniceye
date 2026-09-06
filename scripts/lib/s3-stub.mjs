import http from "node:http";

export function createS3Stub() {
  const objects = new Map();
  const ops = [];
  let failAllPuts = false;
  let failPutIndex = null;
  let putCounter = 0;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean);

    if (req.headers.expect === "100-continue") {
      res.writeContinue();
    }

    const key = segments.slice(1).join("/");
    const bucket = segments[0];
    const collect = () =>
      new Promise((resolve) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
      });

    const logOp = (opState, status) => {
      ops.push({ op: opState, bucket, key, status, at: Date.now() });
    };

    if (!bucket) {
      logOp("invalid", 400);
      res.writeHead(400, { "Content-Type": "application/xml" });
      return res.end("<Error><Code>InvalidRequest</Code><Message>Missing bucket</Message></Error>");
    }

    if (req.method === "PUT") {
      putCounter += 1;
      const isIndexFailure = failPutIndex !== null && putCounter === failPutIndex;
      collect().then((body) => {
        if (failAllPuts || isIndexFailure) {
          if (isIndexFailure) failPutIndex = null;
          // A 500 is retried by the AWS SDK (proves resilience); a 400 is not and
          // cleanly simulates one object write being rejected mid-upload.
          const status = isIndexFailure ? 400 : 500;
          logOp("put", status);
          res.writeHead(status, { "Content-Type": "application/xml" });
          return res.end(`<Error><Code>${status === 400 ? "BadRequest" : "InternalError"}</Code><Message>Simulated S3 failure</Message></Error>`);
        }
        const metadata = {};
        for (const [name, value] of Object.entries(req.headers)) {
          if (name.toLowerCase().startsWith("x-amz-meta-")) {
            metadata[name.toLowerCase().slice("x-amz-meta-".length)] = String(value);
          }
        }
        objects.set(`${bucket}/${key}`, { body, contentType: req.headers["content-type"] || "application/octet-stream", metadata });
        logOp("put", 200);
        ops[ops.length - 1].contentType = req.headers["content-type"] || "application/octet-stream";
        ops[ops.length - 1].metadata = metadata;
        res.writeHead(200, { ETag: `"stub-${putCounter}"` });
        return res.end();
      });
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      const stored = objects.get(`${bucket}/${key}`);
      if (!stored) {
        logOp("get", 404);
        res.writeHead(404, {
          "Content-Type": "application/xml",
          "x-amz-error-code": "NoSuchKey",
        });
        return res.end("<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>");
      }
      logOp("get", 200);
      res.writeHead(200, {
        "Content-Type": stored.contentType,
        "Content-Length": stored.body.length,
      });
      if (req.method === "HEAD") return res.end();
      return res.end(stored.body);
    }

    if (req.method === "DELETE") {
      objects.delete(`${bucket}/${key}`);
      logOp("delete", 204);
      res.writeHead(204);
      return res.end();
    }

    logOp(req.method, 405);
    res.writeHead(405, { "Content-Type": "application/xml" });
    return res.end("<Error><Code>MethodNotAllowed</Code><Message>Unsupported method</Message></Error>");
  });

  return {
    server,
    objects,
    ops,
    listener: null,
    failAllPuts(value) {
      failAllPuts = Boolean(value);
    },
    failPutIndex(value) {
      failPutIndex = value;
    },
    getPutCount() {
      return putCounter;
    },
    objectKeys() {
      return [...objects.keys()].map((stored) => stored.split("/").slice(1).join("/"));
    },
    objectMetadata() {
      const result = [];
      for (const [stored, record] of objects) {
        const segments = stored.split("/");
        result.push({ bucket: segments[0], key: segments.slice(1).join("/"), contentType: record.contentType, metadata: record.metadata });
      }
      return result;
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