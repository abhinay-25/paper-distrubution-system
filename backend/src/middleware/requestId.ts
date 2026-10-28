/**
 * requestId middleware.
 *
 * Attaches a unique request ID to every incoming request, so that correlated
 * log lines and error responses can be traced in observability tooling.
 *
 * The ID is:
 *  - Read from the incoming `X-Request-Id` header if present (forwarded by a
 *    reverse proxy / load balancer), or
 *  - Generated as a UUID v4 otherwise.
 *
 * The resolved ID is attached to `res.locals.requestId` and reflected back to
 * the caller in the `X-Request-Id` response header.
 */

import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();

  res.locals["requestId"] = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}
