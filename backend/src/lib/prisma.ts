/**
 * Prisma client singleton — Prisma 7 with @prisma/adapter-pg.
 *
 * PrismaPg is a driver-adapter factory passed to PrismaClient({ adapter }).
 * It manages the connection pool internally when given a connection string.
 * The migrate adapter is declared separately in prisma.config.ts.
 *
 * Graceful shutdown: call `await closePrisma()` on SIGTERM / SIGINT.
 */

import { PrismaClient } from "../__generated__/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.js";

const adapter = new PrismaPg(env.DATABASE_URL);

export const db = new PrismaClient({
  adapter,
  log:
    env.NODE_ENV === "development"
      ? [
          { emit: "stdout", level: "query" },
          { emit: "stdout", level: "warn" },
          { emit: "stdout", level: "error" },
        ]
      : [
          { emit: "stdout", level: "warn" },
          { emit: "stdout", level: "error" },
        ],
});

export async function closePrisma(): Promise<void> {
  await db.$disconnect();
}
