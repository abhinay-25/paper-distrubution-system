/**
 * DevBar — legacy development persona simulation bar removed in Step 6.
 *
 * Authentication and Role-Based Access Control (RBAC) are now enforced via
 * cryptographically signed server-side sessions (`POST /api/v1/auth/login`)
 * and verified `InstitutionMembership` records.
 */
export function DevBar() {
  return null;
}
