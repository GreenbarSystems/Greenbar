// Raw Prisma client. DO NOT import this outside src/lib/db.
// Request and job code must go through withOrg() (addendum §1.4); the ESLint
// `no-restricted-imports` rule enforces this and CI fails on violations.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
