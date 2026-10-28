// prisma.config.ts — Prisma 7 explicit configuration.
// Declares the schema path and the driver adapter used by prisma migrate.
//
// The PrismaClient adapter (for runtime queries) is configured separately in
// src/lib/prisma.ts so application code does not depend on this file.

import path from "node:path";
import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

export default defineConfig({
  earlyAccess: true,
  schema: path.join(import.meta.dirname, "prisma/schema.prisma"),
  datasource: {
    url: process.env["DATABASE_URL"],
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
  migrate: {
    async adapter(env) {
      const url = env["DATABASE_URL"] || process.env["DATABASE_URL"];
      if (!url) throw new Error("DATABASE_URL is not set in environment");
      return new PrismaPg(url);
    },
  },
});
