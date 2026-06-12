import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const configCandidates = [
  "drizzle.config.ts",
  "drizzle.config.js",
  "drizzle.config.mjs",
  "server/drizzle.config.ts",
  "server/drizzle.config.js",
  "server/drizzle.config.mjs"
];
const schemaCandidates = [
  "shared/schema.ts",
  "server/shared/schema.ts",
  "server/shared/shared/schema.ts",
  "server/shared/shared/schema.js",
  "_shared_DISABLED/schema.ts"
];
const migrationCandidates = [
  "migrations",
  "server/migrations",
  "drizzle",
  "drizzle/migrations",
  "server/drizzle",
  "server/drizzle/migrations"
];

async function exists(relativePath) {
  try {
    await access(path.resolve(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function pathType(relativePath) {
  try {
    const details = await stat(path.resolve(root, relativePath));
    return details.isDirectory() ? "directory" : details.isFile() ? "file" : "other";
  } catch {
    return "missing";
  }
}

function extractConfigValue(source, key) {
  const match = source.match(new RegExp(`\\b${key}\\s*:\\s*["']([^"']+)["']`));
  return match?.[1] ?? null;
}

const configs = [];
for (const candidate of configCandidates) {
  if (!(await exists(candidate))) continue;

  const source = await readFile(path.resolve(root, candidate), "utf8");
  const schemaValue = extractConfigValue(source, "schema");
  const outValue = extractConfigValue(source, "out");
  const configDirectory = path.dirname(candidate);
  const resolvedSchema = schemaValue
    ? path.normalize(path.join(configDirectory, schemaValue))
    : null;
  const resolvedOut = outValue ? path.normalize(path.join(configDirectory, outValue)) : null;

  configs.push({
    Config: candidate,
    SchemaValue: schemaValue ?? "(not statically found)",
    ResolvedSchema: resolvedSchema ?? "(unknown)",
    SchemaExists: resolvedSchema ? await exists(resolvedSchema) : false,
    OutputValue: outValue ?? "(not statically found)",
    ResolvedOutput: resolvedOut ?? "(unknown)",
    OutputExists: resolvedOut ? await exists(resolvedOut) : false
  });
}

console.log("Drizzle config files:");
console.table(
  configs.length
    ? configs
    : [{ Config: "(none found)", SchemaExists: false, OutputExists: false }]
);

console.log("\nCommon schema files:");
console.table(
  await Promise.all(
    schemaCandidates.map(async (candidate) => ({
      Path: candidate,
      Type: await pathType(candidate)
    }))
  )
);

const packagePath = path.resolve(root, "package.json");
let matchingScripts = [];
if (await exists("package.json")) {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  matchingScripts = Object.entries(packageJson.scripts ?? {})
    .filter(([name, command]) =>
      /drizzle|db|migration/i.test(`${name} ${String(command)}`)
    )
    .map(([name, command]) => ({ Script: name, Command: String(command) }));
}

console.log("\nPackage scripts mentioning drizzle, db, or migration:");
console.table(
  matchingScripts.length
    ? matchingScripts
    : [{ Script: "(none found)", Command: "" }]
);

console.log("\nCommon migration paths:");
console.table(
  await Promise.all(
    migrationCandidates.map(async (candidate) => ({
      Path: candidate,
      Type: await pathType(candidate)
    }))
  )
);

const missingConfiguredSchemas = configs.filter((config) => !config.SchemaExists);
console.log("\nSummary:");
console.log(`- Config files found: ${configs.length}`);
console.log(`- Configured schema paths missing: ${missingConfiguredSchemas.length}`);
console.log(`- Database connections made: 0`);
console.log("- Files modified: 0");

if (missingConfiguredSchemas.length > 0) {
  console.log("- Alignment status: FAIL (one or more configured schema paths are missing)");
} else if (configs.length === 0) {
  console.log("- Alignment status: FAIL (no Drizzle config found)");
} else {
  console.log("- Alignment status: PASS");
}
