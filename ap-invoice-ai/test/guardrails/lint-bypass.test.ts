// SEC-4 (addendum §1.6 CI gate): assert that importing the raw Prisma client
// outside src/lib/db is rejected by the ESLint `no-restricted-imports` rule.
//
// We copy the fixture to a temp .ts file, run the project's ESLint over it, and
// assert the rule fires. This proves the withOrg() guardrail cannot be silently
// bypassed.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const fixture = join(root, "test", "fixtures", "illegal-prisma-import.ts.fixture");
const eslintBin = join(root, "node_modules", "eslint", "bin", "eslint.js");

let probeDir: string;
let probeFile: string;

beforeAll(() => {
  // Place the probe inside the project (so @/* + tsconfig resolve) but in a
  // throwaway dir we lint explicitly — it is never part of `npm run lint`.
  // Non-dot prefix: ESLint ignores dot-directories by default.
  probeDir = mkdtempSync(join(root, "test", "fixtures", "probe-"));
  probeFile = join(probeDir, "probe.ts");
  cpSync(fixture, probeFile);
});

afterAll(() => {
  if (probeDir) rmSync(probeDir, { recursive: true, force: true });
});

describe("SEC-4: raw Prisma import is lint-blocked outside src/lib/db", () => {
  it("flags @/lib/db/prisma with no-restricted-imports", () => {
    const result = runEslint(probeFile);
    const messages = result.flatMap((r) => r.messages);
    const ruleIds = messages.map((m) => m.ruleId);
    expect(ruleIds).toContain("no-restricted-imports");
    expect(messages.some((m) => m.severity === 2)).toBe(true);
  });

  it("does NOT flag the same import from inside src/lib/db (override)", () => {
    // The eslintrc override disables the rule under src/lib/db.
    const allowed = join(root, "src", "lib", "db", "__probe_allowed.ts");
    writeFileSync(allowed, 'import { prisma } from "@/lib/db/prisma";\nexport const x = prisma;\n');
    try {
      const result = runEslint(allowed);
      const ruleIds = result.flatMap((r) => r.messages).map((m) => m.ruleId);
      expect(ruleIds).not.toContain("no-restricted-imports");
    } finally {
      rmSync(allowed, { force: true });
    }
  });
});

interface EslintResult {
  messages: Array<{ ruleId: string | null; severity: number; message: string }>;
}

function runEslint(file: string): EslintResult[] {
  try {
    const out = execFileSync(process.execPath, [eslintBin, "--no-ignore", file, "-f", "json"], {
      cwd: root,
      env: { ...process.env, ESLINT_USE_FLAT_CONFIG: "false" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(out) as EslintResult[];
  } catch (err) {
    // ESLint exits non-zero when it reports errors; the JSON report is still on stdout.
    const e = err as { stdout?: string };
    if (e.stdout) return JSON.parse(e.stdout) as EslintResult[];
    throw err;
  }
}
