/**
 * Unit tests for middleware/errorHandler.ts and AppError.
 */

import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";
import { AppError, errorHandler } from "../middleware/errorHandler.js";
import { requestIdMiddleware } from "../middleware/requestId.js";
import { ZodError, z } from "zod";

// Build a minimal Express app wired with both middleware
function makeTestApp(handler: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.get("/test", handler);
  app.use(errorHandler);
  return app;
}

describe("AppError", () => {
  it("creates an error with the given status code", () => {
    const err = new AppError("Oops", 422);
    expect(err.statusCode).toBe(422);
    expect(err.message).toBe("Oops");
    expect(err.isOperational).toBe(true);
  });

  it("AppError.notFound creates a 404 error", () => {
    const err = AppError.notFound();
    expect(err.statusCode).toBe(404);
  });

  it("AppError.unauthorized creates a 401 error", () => {
    expect(AppError.unauthorized().statusCode).toBe(401);
  });

  it("AppError.forbidden creates a 403 error", () => {
    expect(AppError.forbidden().statusCode).toBe(403);
  });

  it("AppError.conflict creates a 409 error", () => {
    expect(AppError.conflict("Already exists").statusCode).toBe(409);
  });

  it("AppError.badRequest creates a 400 error", () => {
    expect(AppError.badRequest("Bad input").statusCode).toBe(400);
  });
});

describe("errorHandler middleware", () => {
  it("returns 404 for AppError.notFound()", async () => {
    const app = makeTestApp((_req, _res, next) => next(AppError.notFound("Thing not found")));
    const res = await request(app).get("/test");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Thing not found");
    expect(res.body.requestId).toBeDefined();
  });

  it("returns 400 for ZodError", async () => {
    const schema = z.object({ name: z.string() });
    const app = makeTestApp((_req, _res, next) => {
      const result = schema.safeParse({ name: 42 });
      if (!result.success) next(result.error);
      else _res.json({});
    });
    const res = await request(app).get("/test");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details).toBeDefined();
  });

  it("returns 500 for unknown errors", async () => {
    // Suppress console.error noise in tests
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = makeTestApp((_req, _res, next) => next(new Error("boom")));
    const res = await request(app).get("/test");
    expect(res.status).toBe(500);
    vi.restoreAllMocks();
  });
});
