import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const SERVER_ENTRY = path.join(REPO_ROOT, "dist", "server", "index.js");

export function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

export function spawnDrivableServer({ env, port, cwd = REPO_ROOT }) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  return {
    child,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
    get combinedOutput() {
      return stdout + stderr;
    },
  };
}

export function waitForHttp(url, { timeoutMs = 20000, intervalMs = 250, expectedStatus = 200 } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (Date.now() - started > timeoutMs) {
        return reject(new Error(`Timed out waiting for ${url} to report HTTP ${expectedStatus}`));
      }
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(intervalMs + 500) });
        if (response.status === expectedStatus) {
          return resolve(response);
        }
      } catch {
        // not up yet
      }
      setTimeout(poll, intervalMs);
    };
    poll();
  });
}

export function stopProcess(runner, { signal = "SIGTERM" } = {}) {
  return new Promise((resolve) => {
    const { child } = runner;
    if (!child || child.exitCode !== null) return resolve();
    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already gone
      }
    }, 4000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    try {
      child.kill(signal);
    } catch {
      clearTimeout(timeout);
      resolve();
    }
  });
}

export function waitForExit(runner, { timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const { child } = runner;
    if (child.exitCode !== null) return resolve(child.exitCode);
    const timeout = setTimeout(() => reject(new Error(`Process did not exit within ${timeoutMs}ms`)), timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}