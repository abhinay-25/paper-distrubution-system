/**
 * Global error-handling middleware.
 *
 * Must be the LAST middleware registered in Express (four-argument signature).
 * Catches all errors passed via `next(err)` and returns a normalised JSON
 * error body so that callers never see raw Express HTML responses.
 *
 * Response shape:
 *   { error: string; requestId?: string; details?: unknown }
 *
 * HTTP status mapping:
 *   - ZodError (validation failures)  → 400
 *   - AppError (application errors)   → error.statusCode
 *   - Everything else                 → 500
 *
 * Sensitive internal details (stack traces, raw DB errors) are only logged
 * server-side and are never sent to the client in production.
 */

import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { ZodError } from "zod";

// ---------------------------------------------------------------------------
// AppError — typed application error with an HTTP status code.
// Throw this anywhere in the application to produce a structured HTTP error.
// ---------------------------------------------------------------------------

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational = true) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    // Maintain proper prototype chain in transpiled code
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static notFound(message = "Resource not found"): AppError {
    return new AppError(message, 404);
  }

  static badRequest(message: string): AppError {
    return new AppError(message, 400);
  }

  static unauthorized(message = "Unauthorized"): AppError {
    return new AppError(message, 401);
  }

  static forbidden(message = "Forbidden"): AppError {
    return new AppError(message, 403);
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409);
  }

  static serviceUnavailable(message = "Service unavailable"): AppError {
    return new AppError(message, 503);
  }
}

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  const requestId = res.locals["requestId"] as string | undefined;

  // --- Zod validation errors ---
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      requestId,
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // --- Known application errors ---
  if (err instanceof AppError) {
    if (!err.isOperational || err.statusCode >= 500) {
      console.error(`[${requestId}] AppError:`, err);
    }
    res.status(err.statusCode).json({
      error: err.message,
      requestId,
    });
    return;
  }

  // --- Unknown / unexpected errors ---
  console.error(`[${requestId}] Unexpected error:`, err);
  const message =
    process.env["NODE_ENV"] !== "production"
      ? (err instanceof Error ? err.message : String(err))
      : "Internal server error";

  res.status(500).json({ error: message, requestId });
};
