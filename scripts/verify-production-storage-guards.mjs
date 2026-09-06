/**
 * Static production storage guard: no in-memory/test-double persistence fake
 * may be reachable from production (non-test) server code.
 *
 * The server defines several in-memory fakes for contract tests:
 *   - server/jobs/in-memory-delivery-outbox.ts
 *   - server/media/in-memory-private-object-storage.ts
 *   - server/review/in-memory-review-repository.ts
 * plus barrels (index.ts) that re-export them for test rigs.
 *
 * This script walks the server source tree, resolves relative import/export
 * specifiers, and computes the transitive closure of modules that re-export a
 * fake. Any production (non-test, non-fake) module that imports a tainted
 * module fails the check. Barrels re-exporting fakes are reported as INFO
 * (intentional test-compat surface) but must not be imported by production.
 *
 * The runtime safety net already exists (assertDurableReviewRepository,
 * assertDurableScalablePrivateStorage, assertDurableDeliveryOutbox); this
 * script is a compile-time/static complement that runs with no database and no
 * dependencies.
 *
 * Exits non-zero on any binding.
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const serverDir = path.join(root, "server");
const failures = [];
const infos = [];

function fail(label, detail) {
  failures.push(`${label}: ${detail}`);
  console.error(`FAIL  ${label} — ${detail}`);
}
function warn(label, detail) {
  infos.push(`${label}: ${detail}`);
  console.log(`INFO  ${label} — ${detail}`);
}
function ok(label, detail) {
  console.log(`OK    ${label} — ${detail}`);
}

function isTestFile(name) {
  return name.endsWith(".test.ts");
}
function isFakeFile(name) {
  return /^in-memory-/.test(path.basename(name)) && !isTestFile(name);
}
function isDisabledFile(name) {
  return name.includes(".DISABLED.ts");
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const files = walk(serverDir);

/** Module id: path relative to server dir, extension-stripped, posix style. */
function moduleId(filePath) {
  return path.posix.normalize(path.relative(serverDir, filePath).replace(/\\/g, "/")).replace(/\.ts$/, "");
}

const byId = new Map();
for (const file of files) {
  byId.set(moduleId(file), {
    file,
    source: fs.readFileSync(file, "utf8"),
    test: isTestFile(file),
    fake: isFakeFile(file),
    disabled: isDisabledFile(file),
  });
}

const IMPORT_SPECIFIER = /(?:from\s+|import\s*\(|import\s+["'`])(["'`])(.+?)\1/g;

function resolveSpecifier(fromId, specifier) {
  if (!specifier.startsWith(".")) return null;
  const segments = specifier.replace(/\.js$/, "").split("/");
  const pathSegs = fromId.split("/");
  pathSegs.pop();
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") pathSegs.pop();
    else pathSegs.push(segment);
  }
  const base = pathSegs.join("/");
  for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
    if (byId.has(candidate)) return candidate;
  }
  return null;
}

function referencedModules(fromId, source) {
  const seen = new Set();
  for (const match of source.matchAll(IMPORT_SPECIFIER)) {
    const resolved = resolveSpecifier(fromId, match[2]);
    if (resolved) seen.add(resolved);
  }
  return [...seen];
}

const reexportTargets = new Map();
for (const [id, mod] of byId) {
  const targets = [];
  for (const match of mod.source.matchAll(/export\s+(?:\*\s+from\s+|{[^}]*}\s+from\s+)["'`](.+?)["'`]/g)) {
    const resolved = resolveSpecifier(id, match[1]);
    if (resolved) targets.push(resolved);
  }
  reexportTargets.set(id, targets);
}

const fakeIds = [...byId.keys()].filter((id) => byId.get(id).fake);

const tainted = new Set(fakeIds);
let grew = true;
let guard = 0;
while (grew && guard < 1000) {
  grew = false;
  guard += 1;
  for (const [id, targets] of reexportTargets) {
    if (tainted.has(id)) continue;
    if (targets.some((target) => tainted.has(target))) {
      tainted.add(id);
      grew = true;
    }
  }
}

for (const id of tainted) {
  const mod = byId.get(id);
  if (!mod) continue;
  if (mod.fake) {
    warn("in-memory fake (allowed location)", `${id} — test double source only`);
  } else if (mod.source.includes("export *") || /export\s+{[^}]*}\s+from/.test(mod.source)) {
    warn("barrel re-exporting fake (must not be imported by production)", id);
  }
}

const offenders = [];
for (const [id, mod] of byId) {
  if (mod.test || mod.fake || mod.disabled) continue;
  // Barrels that re-export fakes are the allowed tainted nodes (test-compat
  // surface). They are flagged below only if some OTHER production module
  // binds to them, so skip them here.
  if (tainted.has(id)) continue;
  for (const target of referencedModules(id, mod.source)) {
    if (tainted.has(target)) {
      offenders.push(`${id} imports ${target}`);
      break;
    }
  }
}

for (const [id, mod] of byId) {
  if (mod.test || mod.fake || mod.disabled || tainted.has(id)) continue;
  ok(`production module ${id}`, "no in-memory fake reachable");
}

if (offenders.length) {
  for (const offender of offenders) fail("production binding to in-memory fake", offender);
  console.error(
    `\nProduction storage guard FAILED (${offenders.length} binding(s)). Fix the imports or the wiring.`,
  );
  process.exit(1);
}

console.log(`\nProduction storage guard PASSED: ${files.length} TS files scanned, ${fakeIds.length} in-memory fakes, ${tainted.size} tainted nodes, 0 production bindings.`);