/**
 * Direct schema push is intentionally disabled. Unlike reviewed migrations,
 * drizzle-kit push cannot run the post-connect database/instance identity
 * assertion before its first DDL operation.
 */
console.error("db:push refused: direct schema push is disabled because its connection target cannot be verified before DDL.");
console.error("Use reviewed SQL migrations only after isolated-target and migration gates are separately authorized.");
process.exit(1);
