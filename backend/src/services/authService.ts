/**
 * Authentication, Session Lifecycle & Institution Membership Service — Step 6
 *
 * Implements:
 *  - Password hashing and constant-time verification via bcrypt (`bcryptjs`)
 *  - Cryptographically signed (HMAC-SHA256), server-side revocable HttpOnly session tokens
 *  - Brute-force / login-attempt rate limiting per IP and account
 *  - Server-side resolution of active User and InstitutionMembership
 *  - Institution-scoped user & membership provisioning for Institution Admins
 */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request } from "express";
import { db } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  getPermissionsForRole,
  isValidSystemRole,
  ROLE_DISPLAY_LABELS,
  type SystemRole,
} from "./permissionPolicy.js";

export const SESSION_COOKIE_NAME = "pds_session";
const BCRYPT_ROUNDS = 10;

// Precomputed dummy bcrypt hash used when a login email does not exist so
// credential verification takes comparable CPU time and prevents timing enumeration.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync("dummy_timing_protection_password_value", BCRYPT_ROUNDS);

export interface SessionTokenPayload {
  sid: string;
  uid: string;
  iid: string;
  csrf: string;
  iat: number;
  exp: number;
}

// Server-side revocation registry (invalidates logged-out session IDs immediately
// before their natural expiration timestamp).
const revokedSessions = new Map<string, number>();

// Login rate limiter state: key -> { count, windowStartMs, lockedUntilMs }
interface LoginAttemptState {
  count: number;
  windowStartMs: number;
  lockedUntilMs: number;
}
const loginAttempts = new Map<string, LoginAttemptState>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_LOGIN_ATTEMPTS = 8;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function getSessionSecret(): string {
  return (
    env.SESSION_SECRET ||
    process.env["SESSION_SECRET"] ||
    "dev_session_hmac_secret_key_at_least_32_chars_long_for_local_auth"
  );
}

function getSessionTtlMs(): number {
  const hours = Number(env.SESSION_TTL_HOURS ?? 8);
  return Math.max(1, hours) * 60 * 60 * 1000;
}

/**
 * Hash a plaintext password using bcrypt (10 cost rounds).
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 */
export async function verifyPassword(
  plainPassword: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith("$2")) {
    // Still run dummy comparison to prevent timing leaks
    await bcrypt.compare(plainPassword, DUMMY_BCRYPT_HASH);
    return false;
  }
  return bcrypt.compare(plainPassword, storedHash);
}

/**
 * Create a cryptographically signed session token with a unique session ID (`sid`)
 * and CSRF token.
 */
export function createSessionToken(params: {
  userId: string;
  institutionId: string;
  ttlMs?: number;
  sid?: string;
  csrfToken?: string;
}): { token: string; payload: SessionTokenPayload } {
  const now = Date.now();
  const ttl = params.ttlMs ?? getSessionTtlMs();
  const payload: SessionTokenPayload = {
    sid: params.sid ?? crypto.randomBytes(24).toString("hex"),
    uid: params.userId,
    iid: params.institutionId,
    csrf: params.csrfToken ?? crypto.randomBytes(24).toString("hex"),
    iat: now,
    exp: now + ttl,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");

  return {
    token: `${encodedPayload}.${signature}`,
    payload,
  };
}

/**
 * Verify a signed session token's HMAC signature, expiration, and server-side revocation state.
 */
export function verifySessionToken(rawToken: string | null | undefined): SessionTokenPayload | null {
  if (!rawToken || typeof rawToken !== "string") return null;
  const parts = rawToken.trim().split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");

  const providedBuf = Buffer.from(providedSig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as SessionTokenPayload;

    if (
      !decoded ||
      typeof decoded.sid !== "string" ||
      typeof decoded.uid !== "string" ||
      typeof decoded.iid !== "string" ||
      typeof decoded.exp !== "number"
    ) {
      return null;
    }

    const now = Date.now();
    if (decoded.exp <= now) {
      revokedSessions.delete(decoded.sid);
      return null;
    }

    if (revokedSessions.has(decoded.sid)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Invalidate a session token server-side so any subsequent replay is rejected.
 */
export function revokeSessionToken(rawToken: string | null | undefined): boolean {
  const payload = verifySessionToken(rawToken);
  if (!payload) return false;
  revokedSessions.set(payload.sid, payload.exp);
  return true;
}

export function clearRevokedSessions(): void {
  revokedSessions.clear();
}

/**
 * Parse cookies from standard `Cookie` header without requiring external middleware.
 */
export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;

  for (const pair of cookieHeader.split(";")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const rawVal = pair.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

/**
 * Extract the session token from the HttpOnly `pds_session` cookie or `Authorization: Bearer` header.
 */
export function extractSessionTokenFromRequest(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME]!;
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) return token;
  }

  return null;
}

/**
 * Build the `Set-Cookie` header string for the `pds_session` HttpOnly cookie.
 */
export function buildSessionCookieHeader(token: string, maxAgeSeconds?: number): string {
  const maxAge = maxAgeSeconds ?? Math.floor(getSessionTtlMs() / 1000);
  const isProd = (process.env["NODE_ENV"] ?? env.NODE_ENV) === "production";
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (isProd) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/**
 * Build the `Set-Cookie` header string that clears `pds_session`.
 */
export function buildClearSessionCookieHeader(): string {
  const isProd = (process.env["NODE_ENV"] ?? env.NODE_ENV) === "production";
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (isProd) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

// ---------------------------------------------------------------------------
// Login Brute-Force / Rate-Limit Protection
// ---------------------------------------------------------------------------

function getRateLimitKeys(email: string, ipAddress?: string): string[] {
  const normalizedEmail = email.trim().toLowerCase();
  const ip = (ipAddress || "unknown").trim();
  return [`acct:${normalizedEmail}`, `ip:${ip}:${normalizedEmail}`];
}

export function checkLoginRateLimit(email: string, ipAddress?: string): void {
  const now = Date.now();
  for (const key of getRateLimitKeys(email, ipAddress)) {
    const state = loginAttempts.get(key);
    if (!state) continue;

    if (state.lockedUntilMs > now) {
      throw new AppError(
        "Too many failed sign-in attempts. Please wait before trying again.",
        429,
      );
    }

    if (now - state.windowStartMs > LOGIN_WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }
}

export function recordFailedLoginAttempt(email: string, ipAddress?: string): void {
  const now = Date.now();
  for (const key of getRateLimitKeys(email, ipAddress)) {
    const current = loginAttempts.get(key);
    if (!current || now - current.windowStartMs > LOGIN_WINDOW_MS) {
      loginAttempts.set(key, {
        count: 1,
        windowStartMs: now,
        lockedUntilMs: 0,
      });
      continue;
    }

    const nextCount = current.count + 1;
    loginAttempts.set(key, {
      count: nextCount,
      windowStartMs: current.windowStartMs,
      lockedUntilMs: nextCount >= MAX_FAILED_LOGIN_ATTEMPTS ? now + LOCKOUT_DURATION_MS : 0,
    });
  }
}

export function clearLoginAttempts(email: string, ipAddress?: string): void {
  for (const key of getRateLimitKeys(email, ipAddress)) {
    loginAttempts.delete(key);
  }
}

export function resetLoginRateLimiter(): void {
  loginAttempts.clear();
}

// ---------------------------------------------------------------------------
// Core Authentication Operations
// ---------------------------------------------------------------------------

export interface AuthenticatedSessionResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    isActive: boolean;
    lastLoginAt: Date | null;
  };
  activeMembership: {
    id: string;
    institutionId: string;
    role: SystemRole;
    roleLabel: string;
    status: string;
    institution: {
      id: string;
      name: string;
      slug: string;
      status: string;
    };
  };
  memberships: Array<{
    id: string;
    institutionId: string;
    role: SystemRole;
    roleLabel: string;
    status: string;
    institution: {
      id: string;
      name: string;
      slug: string;
      status: string;
    };
  }>;
  permissions: string[];
  csrfToken: string;
}

/**
 * Authenticate a user by email and password, verify active institution membership,
 * issue a signed session token, and record login metadata.
 */
export async function loginWithCredentials(input: {
  email: string;
  password: string;
  institutionId?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ session: AuthenticatedSessionResponse; token: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();

  checkLoginRateLimit(normalizedEmail, input.ipAddress);

  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      memberships: {
        where: { status: "ACTIVE" },
        include: {
          institution: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  const passwordValid = await verifyPassword(input.password, user?.hashedPassword);

  if (!user || !user.isActive || !passwordValid) {
    recordFailedLoginAttempt(normalizedEmail, input.ipAddress);
    throw new AppError("Invalid email or password", 401);
  }

  const activeMemberships = user.memberships.filter(
    (m) => m.status === "ACTIVE" && m.institution.status === "ACTIVE",
  );

  if (activeMemberships.length === 0) {
    throw new AppError(
      "Your account does not have an active membership in any active institution",
      403,
    );
  }

  let selectedMembership = activeMemberships[0]!;
  if (input.institutionId) {
    const match = activeMemberships.find((m) => m.institutionId === input.institutionId);
    if (!match) {
      throw new AppError(
        "Access denied: Your account is not a member of the requested institution",
        403,
      );
    }
    selectedMembership = match;
  }

  clearLoginAttempts(normalizedEmail, input.ipAddress);

  const now = new Date();
  await db.user
    .update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    })
    .catch(() => {});

  await db.auditLog
    ?.create?.({
      data: {
        institutionId: selectedMembership.institutionId,
        userId: user.id,
        action: "auth.login",
        resourceType: "User",
        resourceId: user.id,
        payload: { role: selectedMembership.role },
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
    .catch(() => {});

  const { token, payload } = createSessionToken({
    userId: user.id,
    institutionId: selectedMembership.institutionId,
  });

  const role = selectedMembership.role as SystemRole;
  const formattedMemberships = activeMemberships.map((m) => {
    const r = m.role as SystemRole;
    return {
      id: m.id,
      institutionId: m.institutionId,
      role: r,
      roleLabel: ROLE_DISPLAY_LABELS[r] || r,
      status: m.status,
      institution: m.institution,
    };
  });

  return {
    token,
    session: {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isActive: user.isActive,
        lastLoginAt: now,
      },
      activeMembership: formattedMemberships.find(
        (m) => m.institutionId === selectedMembership.institutionId,
      )!,
      memberships: formattedMemberships,
      permissions: getPermissionsForRole(role),
      csrfToken: payload.csrf,
    },
  };
}

/**
 * Resolve the full authenticated user profile and active institution membership
 * from a verified session token payload.
 */
export async function resolveAuthenticatedSession(
  payload: SessionTokenPayload,
  requestedInstitutionId?: string | null,
): Promise<AuthenticatedSessionResponse> {
  const user = await db.user.findUnique({
    where: { id: payload.uid },
    include: {
      memberships: {
        where: { status: "ACTIVE" },
        include: {
          institution: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!user || !user.isActive) {
    throw new AppError("Authentication session is no longer valid", 401);
  }

  const activeMemberships = user.memberships.filter(
    (m) => m.status === "ACTIVE" && m.institution.status === "ACTIVE",
  );

  if (activeMemberships.length === 0) {
    throw new AppError("No active institution membership found for this user", 403);
  }

  const targetInstitutionId = requestedInstitutionId || payload.iid;
  const matchedMembership = activeMemberships.find(
    (m) => m.institutionId === targetInstitutionId,
  );

  if (!matchedMembership) {
    throw new AppError(
      "Access denied: You do not have an active membership in the requested institution",
      403,
    );
  }

  const formattedMemberships = activeMemberships.map((m) => {
    const r = m.role as SystemRole;
    return {
      id: m.id,
      institutionId: m.institutionId,
      role: r,
      roleLabel: ROLE_DISPLAY_LABELS[r] || r,
      status: m.status,
      institution: m.institution,
    };
  });

  const activeRole = matchedMembership.role as SystemRole;

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    },
    activeMembership: formattedMemberships.find(
      (m) => m.institutionId === matchedMembership.institutionId,
    )!,
    memberships: formattedMemberships,
    permissions: getPermissionsForRole(activeRole),
    csrfToken: payload.csrf,
  };
}

// ---------------------------------------------------------------------------
// Institution Membership Administration (INSTITUTION_ADMIN / SUPER_ADMIN)
// ---------------------------------------------------------------------------

export async function listInstitutionMemberships(institutionId: string) {
  const memberships = await db.institutionMembership.findMany({
    where: { institutionId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return memberships.map((m) => {
    const role = m.role as SystemRole;
    return {
      id: m.id,
      institutionId: m.institutionId,
      userId: m.userId,
      role,
      roleLabel: ROLE_DISPLAY_LABELS[role] || role,
      status: m.status,
      joinedAt: m.joinedAt,
      updatedAt: m.updatedAt,
      user: m.user,
    };
  });
}

export async function provisionInstitutionMember(
  institutionId: string,
  actorUserId: string | null,
  actorRole: string | null,
  input: {
    email: string;
    displayName: string;
    password: string;
    role: SystemRole;
  },
) {
  if (!isValidSystemRole(input.role)) {
    throw new AppError(`Invalid role: ${input.role}`, 400);
  }

  if (input.role === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN") {
    throw new AppError("Only a platform SUPER_ADMIN can assign the SUPER_ADMIN role", 403);
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const hashedPassword = await hashPassword(input.password);

  return db.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      user = await tx.user.create({
        data: {
          email: normalizedEmail,
          displayName: input.displayName.trim(),
          hashedPassword,
          isActive: true,
        },
      });
    } else {
      user = await tx.user.update({
        where: { id: user.id },
        data: {
          displayName: input.displayName.trim(),
          hashedPassword,
          isActive: true,
        },
      });
    }

    const membership = await tx.institutionMembership.upsert({
      where: {
        institutionId_userId: {
          institutionId,
          userId: user.id,
        },
      },
      update: {
        role: input.role,
        status: "ACTIVE",
      },
      create: {
        institutionId,
        userId: user.id,
        role: input.role,
        status: "ACTIVE",
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
            isActive: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
    });

    await tx.auditLog
      ?.create?.({
        data: {
          institutionId,
          userId: actorUserId,
          action: "membership.provisioned",
          resourceType: "InstitutionMembership",
          resourceId: membership.id,
          payload: {
            targetUserId: user.id,
            targetEmail: user.email,
            role: membership.role,
          },
        },
      })
      .catch(() => {});

    return {
      id: membership.id,
      institutionId: membership.institutionId,
      userId: membership.userId,
      role: membership.role,
      roleLabel: ROLE_DISPLAY_LABELS[membership.role as SystemRole] || membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt,
      updatedAt: membership.updatedAt,
      user: membership.user,
    };
  });
}

export async function updateInstitutionMembership(
  institutionId: string,
  membershipId: string,
  actorUserId: string | null,
  actorRole: string | null,
  input: {
    role?: SystemRole;
    status?: "ACTIVE" | "SUSPENDED" | "REVOKED";
  },
) {
  const existing = await db.institutionMembership.findUnique({
    where: { id: membershipId },
  });

  if (!existing || existing.institutionId !== institutionId) {
    throw new AppError("Institution membership not found", 404);
  }

  if (input.role === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN") {
    throw new AppError("Only a platform SUPER_ADMIN can assign the SUPER_ADMIN role", 403);
  }

  const updated = await db.institutionMembership.update({
    where: { id: membershipId },
    data: {
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      },
    },
  });

  await db.auditLog
    ?.create?.({
      data: {
        institutionId,
        userId: actorUserId,
        action: "membership.updated",
        resourceType: "InstitutionMembership",
        resourceId: updated.id,
        payload: { role: updated.role, status: updated.status },
      },
    })
    .catch(() => {});

  return {
    id: updated.id,
    institutionId: updated.institutionId,
    userId: updated.userId,
    role: updated.role,
    roleLabel: ROLE_DISPLAY_LABELS[updated.role as SystemRole] || updated.role,
    status: updated.status,
    joinedAt: updated.joinedAt,
    updatedAt: updated.updatedAt,
    user: updated.user,
  };
}

