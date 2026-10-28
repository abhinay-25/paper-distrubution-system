/**
 * Unit tests for the health routes.
 *
 * Both the Prisma singleton AND the env module are mocked so these tests
 * run without a real database or a real .env file.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// --- Mock env BEFORE any app import so process.exit is never called ---
vi.mock("../config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4000,
    CORS_ORIGIN: "http://localhost:5173",
    DATABASE_URL: "postgresql://test:test@localhost:5432/pds_test",
    AI_SERVICE_URL: "http://127.0.0.1:8000",
    AI_SERVICE_TOKEN: "dev_internal_service_secret_token_at_least_32_chars_long_for_security",
  },
}));

// --- Mock the Prisma singleton ---
vi.mock("../lib/prisma.js", () => ({
  db: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
  closePrisma: vi.fn().mockResolvedValue(undefined),
}));

import { createApp } from "../app.js";
import { db } from "../lib/prisma.js";

const app = createApp();

describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      service: "pds-backend",
      environment: "test",
    });
    expect(res.body.timestamp).toBeDefined();
  });

  it("includes X-Request-Id header in response", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("echoes back a provided X-Request-Id", async () => {
    const id = "test-request-id-123";
    const res = await request(app).get("/api/health").set("X-Request-Id", id);
    expect(res.headers["x-request-id"]).toBe(id);
  });
});

describe("GET /api/health/db", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 when DB is reachable", async () => {
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);
    const res = await request(app).get("/api/health/db");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "connected" });
    expect(typeof res.body.latencyMs).toBe("number");
  });

  it("returns 503 when DB is unreachable", async () => {
    vi.mocked(db.$queryRaw).mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(app).get("/api/health/db");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "error", database: "unreachable" });
  });
});

describe("404 handler", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/api/unknown-route");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Not found" });
  });
});
