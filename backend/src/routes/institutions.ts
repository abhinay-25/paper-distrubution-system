/**
 * Institution Membership & Administration Routes — Step 6
 *
 * Base path: /api/v1/institutions
 * All routes require `memberships:manage` permission (INSTITUTION_ADMIN or SUPER_ADMIN).
 */

import { Router } from "express";
import { z } from "zod";
import { getTenant, requirePermission } from "../middleware/tenantContext.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  listInstitutionMemberships,
  provisionInstitutionMember,
  updateInstitutionMembership,
} from "../services/authService.js";
import type { SystemRole } from "../services/permissionPolicy.js";

export const institutionRouter = Router();

const roleEnumSchema = z.enum([
  "SUPER_ADMIN",
  "INSTITUTION_ADMIN",
  "EXAM_CONTROLLER",
  "EXAMINER",
  "MODERATOR",
  "VIEWER",
]);

const provisionMemberSchema = z.object({
  email: z.string().trim().email("Valid email address is required").max(255),
  displayName: z.string().trim().min(2, "Display name is required").max(120),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password cannot exceed 128 characters"),
  role: roleEnumSchema,
});

const updateMemberSchema = z.object({
  role: roleEnumSchema.optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]).optional(),
});

const membershipParamSchema = z.object({
  membershipId: z.string().uuid("Invalid membership UUID"),
});

/**
 * GET /api/v1/institutions/memberships
 * List all users and memberships in the authenticated administrator's institution.
 */
institutionRouter.get(
  "/memberships",
  requirePermission("memberships:manage"),
  async (_req, res, next) => {
    try {
      const { institutionId } = getTenant(res);
      const memberships = await listInstitutionMemberships(institutionId);
      res.json({ data: memberships });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/institutions/memberships
 * Provision or update a user account and assign their role in the active institution.
 */
institutionRouter.post(
  "/memberships",
  requirePermission("memberships:manage"),
  async (req, res, next) => {
    try {
      const { institutionId, userId, userRole } = getTenant(res);
      const parsed = provisionMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues.map((i) => i.message).join("; ") || "Invalid member payload",
          400,
        );
      }

      const created = await provisionInstitutionMember(
        institutionId,
        userId,
        userRole,
        {
          email: parsed.data.email,
          displayName: parsed.data.displayName,
          password: parsed.data.password,
          role: parsed.data.role as SystemRole,
        },
      );
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/institutions/memberships/:membershipId
 * Update a member's role or membership status within the active institution.
 */
institutionRouter.patch(
  "/memberships/:membershipId",
  requirePermission("memberships:manage"),
  async (req, res, next) => {
    try {
      const { institutionId, userId, userRole } = getTenant(res);
      const { membershipId } = membershipParamSchema.parse(req.params);
      const parsed = updateMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues.map((i) => i.message).join("; ") || "Invalid update payload",
          400,
        );
      }

      const updated = await updateInstitutionMembership(
        institutionId,
        membershipId,
        userId,
        userRole,
        {
          role: parsed.data.role as SystemRole | undefined,
          status: parsed.data.status,
        },
      );
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

