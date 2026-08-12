import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __iezerPrisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__iezerPrisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__iezerPrisma__ = prisma;
}
