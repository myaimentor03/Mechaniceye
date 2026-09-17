import assert from "node:assert/strict";
import test from "node:test";
import { redactDatabaseError } from "./db.js";

const ORIGINAL_DB_URL = process.env.DATABASE_URL;

function withDbUrl<T>(url: string, fn: () => T): T {
  process.env.DATABASE_URL = url;
  try {
    return fn();
  } finally {
    if (ORIGINAL_DB_URL === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = ORIGINAL_DB_URL;
    }
  }
}

// --- Non-Error inputs ---

test("returns 'Unknown database error' for non-Error input", () => {
  withDbUrl("postgresql://user:pass@localhost:5432/mydb", () => {
    assert.equal(redactDatabaseError(null), "Unknown database error");
  });
});

test("returns 'Unknown database error' for undefined input", () => {
  withDbUrl("postgresql://user:pass@localhost:5432/mydb", () => {
    assert.equal(redactDatabaseError(undefined), "Unknown database error");
  });
});

test("returns 'Unknown database error' for string input", () => {
  withDbUrl("postgresql://user:pass@localhost:5432/mydb", () => {
    assert.equal(redactDatabaseError("some string"), "Unknown database error");
  });
});

// --- No DATABASE_URL configured ---

test("returns raw message when DATABASE_URL is not set", () => {
  delete process.env.DATABASE_URL;
  const msg = redactDatabaseError(new Error("connection refused"));
  assert.equal(msg, "connection refused");
});

// --- Full URL redaction ---

test("redacts full connection string from error message", () => {
  withDbUrl("postgresql://admin:s3cret@db.example.com:5432/drivable", () => {
    const err = new Error("FATAL: connection to postgresql://admin:s3cret@db.example.com:5432/drivable refused");
    const redacted = redactDatabaseError(err);
    assert.equal(redacted.includes("s3cret"), false);
    assert.equal(redacted.includes("admin"), false);
    assert.equal(redacted.includes("db.example.com"), false);
    assert.equal(redacted.includes("drivable"), false);
    assert.ok(redacted.includes("[redacted]"));
  });
});

// --- Individual component redaction ---

test("redacts username from error message", () => {
  withDbUrl("postgresql://dbadmin:secret123@db.example.com:5432/drivable", () => {
    const err = new Error("authentication failed for user dbadmin");
    const redacted = redactDatabaseError(err);
    assert.equal(redacted.includes("dbadmin"), false);
  });
});

test("redacts password from error message", () => {
  withDbUrl("postgresql://dbadmin:secret123@db.example.com:5432/drivable", () => {
    const err = new Error("password authentication failed for user dbadmin");
    const redacted = redactDatabaseError(err);
    assert.equal(redacted.includes("secret123"), false);
  });
});

test("redacts host from error message", () => {
  withDbUrl("postgresql://dbadmin:secret123@db.example.com:5432/drivable", () => {
    const err = new Error("could not connect to db.example.com:5432");
    const redacted = redactDatabaseError(err);
    assert.equal(redacted.includes("db.example.com"), false);
  });
});

test("redacts hostname from error message", () => {
  withDbUrl("postgresql://dbadmin:secret123@db.example.com:5432/drivable", () => {
    const err = new Error("DNS lookup for db.example.com failed");
    const redacted = redactDatabaseError(err);
    assert.equal(redacted.includes("db.example.com"), false);
  });
});

test("redacts database name (pathname) from error message", () => {
  withDbUrl("postgresql://dbadmin:secret123@db.example.com:5432/drivable", () => {
    const err = new Error("database \"drivable\" does not exist");
    const redacted = redactDatabaseError(err);
    assert.equal(redacted.includes("drivable"), false);
  });
});

// --- URL-encoded credentials ---

test("redacts URL-encoded password from error message", () => {
  withDbUrl("postgresql://user:p%40ssw0rd@localhost:5432/mydb", () => {
    const err = new Error("FATAL: p%40ssw0rd authentication failed");
    const redacted = redactDatabaseError(err);
    assert.equal(redacted.includes("p%40ssw0rd"), false);
    assert.equal(redacted.includes("p@ssw0rd"), false);
  });
});

// --- Regex fallback ---

test("regex fallback catches remaining postgres:// patterns", () => {
  withDbUrl("postgresql://admin:pass@host:5432/db", () => {
    const err = new Error("FATAL: postgres://admin:pass@host:5432/db - connection lost");
    const redacted = redactDatabaseError(err);
    assert.ok(!redacted.includes("admin:pass@host"));
    assert.ok(redacted.includes("[redacted]"));
  });
});

test("regex fallback catches postgresql:// variant in error", () => {
  withDbUrl("postgresql://admin:pass@host:5432/db", () => {
    const err = new Error("Tried postgresql://admin:pass@host but failed");
    const redacted = redactDatabaseError(err);
    assert.ok(!redacted.includes("admin:pass@"));
  });
});

// --- Edge cases ---

test("redacts even when error message is very long", () => {
  withDbUrl("postgresql://u:p@h:5432/d", () => {
    const longMsg = "error ".repeat(500) + "postgresql://u:p@h:5432/d " + "log ".repeat(500);
    const err = new Error(longMsg);
    const redacted = redactDatabaseError(err);
    assert.equal(redacted.includes("postgresql://u:p@"), false);
  });
});

test("redacts multiple occurrences of the same credential", () => {
  withDbUrl("postgresql://admin:s3cret@db.example.com:5432/drivable", () => {
    const err = new Error(
      "s3cret in postgresql://admin:s3cret@db.example.com:5432/drivable and again s3cret"
    );
    const redacted = redactDatabaseError(err);
    assert.equal(redacted.includes("s3cret"), false);
  });
});

// --- No DATABASE_URL: Error without DB URL set ---

test("returns message when DATABASE_URL is undefined and error has no DB info", () => {
  delete process.env.DATABASE_URL;
  const err = new Error("table does not exist");
  assert.equal(redactDatabaseError(err), "table does not exist");
});
