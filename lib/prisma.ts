import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

/**
 * Resolve DATABASE_URL to an absolute path.
 * Supports "file:./relative" and "file:/absolute" formats.
 * Resolves relative paths against the project root (where package.json lives).
 */
function resolveDbUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  if (!raw.startsWith("file:")) return raw;

  const filePath = raw.slice("file:".length);
  if (path.isAbsolute(filePath)) return raw;

  // Resolve relative to project root (process.cwd() in dev, __dirname in standalone)
  const resolved = path.resolve(process.cwd(), filePath);
  return `file:${resolved}`;
}

const dbUrl = resolveDbUrl();

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
