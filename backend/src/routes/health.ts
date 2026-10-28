import { Router } from "express";
import { db } from "../lib/prisma.js";
import { env } from "../config/env.js";

export const healthRouter = Router();

/**
 * GET /api/health
 * Basic liveness check — always returns 200 if the process is running.
 */
healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "pds-backend",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health/db
 * Readiness check — verifies the database connection is alive.
 * Returns 200 (ok) or 503 (service_unavailable) with a latency measurement.
 */
healthRouter.get("/db", async (_req, res) => {
  const start = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    res.json({
      status: "ok",
      service: "pds-backend",
      database: "connected",
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    console.error("Health DB check failed:", err);
    res.status(503).json({
      status: "error",
      service: "pds-backend",
      database: "unreachable",
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  }
});
