// One-shot Supabase bootstrap. Idempotent — safe to re-run.
//   node --env-file=.env scripts/db-setup.mjs
//
// Sequence:
//   1. prisma db push      -> create tables (uses directUrl = postgres, has DDL rights)
//   2. apply RLS SQL        -> roles, tenant policies, grants, partial unique index (as admin)
//   3. set role passwords   -> app_user / app_worker login passwords + schema usage
//
// Requires in .env: DIRECT_URL, DATABASE_ADMIN_URL, APP_USER_PASSWORD, APP_WORKER_PASSWORD.
import { execFileSync } from "node:child_process";

const required = ["DIRECT_URL", "DATABASE_ADMIN_URL", "APP_USER_PASSWORD", "APP_WORKER_PASSWORD"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}. Run with: node --env-file=.env scripts/db-setup.mjs`);
  process.exit(1);
}

const ADMIN = process.env.DATABASE_ADMIN_URL;
// Invoke Prisma's JS entry directly with `node` — avoids Windows' .cmd spawn
// restriction (EINVAL) and shell-quoting of `&` in the connection URLs.
const prismaBin = "node_modules/prisma/build/index.js";

function run(args, opts = {}) {
  execFileSync(process.execPath, [prismaBin, ...args], { stdio: "inherit", ...opts });
}

console.log("\n[1/3] prisma db push (create tables)…");
run(["db", "push", "--skip-generate"]);

console.log("\n[2/3] apply RLS policies, roles, constraints…");
run(["db", "execute", "--url", ADMIN, "--file", "prisma/migrations/manual/0001_rls_and_constraints.sql"]);

console.log("\n[3/3] set app_user / app_worker login passwords + grants…");
const sql = `
ALTER ROLE app_user   WITH LOGIN PASSWORD '${process.env.APP_USER_PASSWORD}';
ALTER ROLE app_worker WITH LOGIN PASSWORD '${process.env.APP_WORKER_PASSWORD}';
GRANT USAGE ON SCHEMA public TO app_user, app_worker;
`;
run(["db", "execute", "--url", ADMIN, "--stdin"], { input: sql, stdio: ["pipe", "inherit", "inherit"] });

console.log("\n✓ Supabase bootstrap complete. App connects as app_user (RLS enforced).");
console.log("  Verify isolation:  npm run test:integration");
