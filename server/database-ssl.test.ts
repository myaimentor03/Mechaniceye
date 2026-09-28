import assert from "node:assert/strict";
import test from "node:test";
import { isLoopbackDatabaseUrl, sslConfigForDatabaseUrl } from "./database-ssl.js";

test("loopback detection reads the parsed host, not a substring of the URL", () => {
  assert.equal(isLoopbackDatabaseUrl("postgres://user:pw@localhost:5432/db"), true);
  assert.equal(isLoopbackDatabaseUrl("postgresql://user:pw@127.0.0.1:5432/db"), true);
  assert.equal(isLoopbackDatabaseUrl("postgres://db.internal.example.com:5432/db"), false);
});

test("credentials and query options cannot disguise a remote host as loopback", () => {
  // A substring scan of the whole URL matched the password, the path and the
  // `options=-c host=...` startup parameter, which silently disabled TLS for a
  // remote database.
  const disguised = [
    "postgres://user:localhost@db.example.com:5432/prod",
    "postgres://db.example.com:5432/localhost",
    "postgres://db.example.com:5432/prod?options=-c%20host%3Dlocalhost",
    "postgres://db.example.com:5432/prod?application_name=localhost",
    "postgres://db.example.com:5432/prod#localhost",
  ];

  for (const databaseUrl of disguised) {
    assert.equal(isLoopbackDatabaseUrl(databaseUrl), false, `${databaseUrl} was treated as loopback`);
    assert.deepEqual(
      sslConfigForDatabaseUrl(databaseUrl, {}),
      { rejectUnauthorized: false },
      `${databaseUrl} lost its TLS configuration`,
    );
  }
});

test("explicit SSL modes still win over host detection", () => {
  const remote = "postgres://db.example.com:5432/prod";
  assert.deepEqual(sslConfigForDatabaseUrl(remote, { DRIVABLE_DATABASE_SSL_MODE: "disable" }), false);
  assert.deepEqual(sslConfigForDatabaseUrl(remote, { DRIVABLE_DATABASE_SSL_MODE: "verify-full" }), { rejectUnauthorized: true });
  assert.deepEqual(sslConfigForDatabaseUrl("postgres://localhost:5432/db", {}), false);
  assert.deepEqual(sslConfigForDatabaseUrl("postgres://localhost:5432/db", { DRIVABLE_DATABASE_SSL_MODE: "verify-full" }), { rejectUnauthorized: true });
});

test("unparseable and non-postgres URLs keep the safer remote TLS posture", () => {
  for (const databaseUrl of ["", "not-a-url", "mysql://localhost/db", "https://localhost/db"]) {
    assert.equal(isLoopbackDatabaseUrl(databaseUrl), false, `${databaseUrl} was treated as loopback`);
    assert.deepEqual(sslConfigForDatabaseUrl(databaseUrl, {}), { rejectUnauthorized: false });
  }
});
