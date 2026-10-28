/**
 * Authentication Routes — Step 6
 *
 * Mounted at `/api/v1/auth` (and `/api/auth`) BEFORE `tenantContextMiddleware`
 * so unauthenticated users can log in and check/clear sessions cleanly.
 */

import { Router } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";
import {
  loginWithCredentials,
  extractSessionTokenFromRequest,
  verifySessionToken,
  revokeSessionToken,
  resolveAuthenticatedSession,
  createSessionToken,
  buildSessionCookieHeader,
  buildClearSessionCookieHeader,
} from "../services/authService.js";

export const authRouter = Router();

const loginBodySchema = z.object({
  email: z.string().trim().email("Please provide a valid email address").max(255),
  password: z.string().min(1, "Password is required").max(256),
  institutionId: z.string().uuid().optional(),
});

const switchInstitutionSchema = z.object({
  institutionId: z.string().uuid("Please provide a valid institution UUID"),
});

/**
 * POST /api/v1/auth/login
 * Validates user credentials, checks active institution membership, and sets
 * a signed HttpOnly session cookie (`pds_session`).
 */
authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = loginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues.map((i) => i.message).join("; ") || "Invalid login request",
        400,
      );
    }

    const ipAddress =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      undefined;
    const userAgent = (req.headers["user-agent"] as string | undefined) || undefined;

    const { session, token } = await loginWithCredentials({
      email: parsed.data.email,
      password: parsed.data.password,
      institutionId: parsed.data.institutionId,
      ipAddress,
      userAgent,
    });

    res.setHeader("Set-Cookie", buildSessionCookieHeader(token));
    res.status(200).json(session);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/logout
 * Revokes the current session server-side and clears the `pds_session` HttpOnly cookie.
 */
authRouter.post("/logout", (req, res) => {
  const rawToken = extractSessionTokenFromRequest(req);
  if (rawToken) {
    revokeSessionToken(rawToken);
  }

  res.setHeader("Set-Cookie", buildClearSessionCookieHeader());
  res.status(200).json({
    authenticated: false,
    message: "Signed out successfully",
  });
});

/**
 * GET /api/v1/auth/me
 * Returns the currently authenticated user, active institution membership,
 * all active memberships, and resolved role permissions.
 */
authRouter.get("/me", async (req, res, next) => {
  try {
    const rawToken = extractSessionTokenFromRequest(req);
    if (!rawToken) {
      throw new AppError("Authentication required", 401);
    }

    const payload = verifySessionToken(rawToken);
    if (!payload) {
      res.setHeader("Set-Cookie", buildClearSessionCookieHeader());
      throw new AppError("Invalid or expired authentication session", 401);
    }

    const rawInstHeader = req.headers["x-institution-id"];
    const requestedInstId = Array.isArray(rawInstHeader) ? rawInstHeader[0] : rawInstHeader;

    const session = await resolveAuthenticatedSession(payload, requestedInstId || null);
    res.status(200).json(session);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/switch-institution
 * Switches the active institution in the user's session if the user holds an
 * ACTIVE membership in the target institution.
 */
authRouter.post("/switch-institution", async (req, res, next) => {
  try {
    const rawToken = extractSessionTokenFromRequest(req);
    if (!rawToken) {
      throw new AppError("Authentication required", 401);
    }

    const payload = verifySessionToken(rawToken);
    if (!payload) {
      throw new AppError("Invalid or expired authentication session", 401);
    }

    const parsed = switchInstitutionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("Invalid institution ID", 400);
    }

    const session = await resolveAuthenticatedSession(payload, parsed.data.institutionId);

    // Revoke old session token and issue a fresh token bound to the new institutionId
    revokeSessionToken(rawToken);
    const { token: newToken } = createSessionToken({
      userId: session.user.id,
      institutionId: session.activeMembership.institutionId,
      csrfToken: session.csrfToken,
    });

    res.setHeader("Set-Cookie", buildSessionCookieHeader(newToken));
    res.status(200).json(session);
  } catch (err) {
    next(err);
  }
});

