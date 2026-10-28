/**
 * Centralized Role-Based Access Control (RBAC) & Permission Policy — Step 6
 *
 * Maps database `UserRole` values to explicit, granular operation permissions.
 * Route handlers and services must check permissions via this centralized policy
 * rather than scattering ad-hoc role string comparisons.
 */

export type SystemRole =
  | "SUPER_ADMIN"
  | "INSTITUTION_ADMIN"
  | "EXAM_CONTROLLER"
  | "EXAMINER"
  | "MODERATOR"
  | "VIEWER";

export type Permission =
  | "dashboard:view"
  | "subjects:view"
  | "subjects:manage"
  | "questions:view"
  | "questions:write"
  | "ai:view"
  | "ai:generate"
  | "ai:promote"
  | "exams:view"
  | "exams:manage"
  | "papers:view"
  | "papers:prepare"
  | "papers:submit"
  | "submissions:view"
  | "submissions:decide"
  | "pdf:generate"
  | "pdf:download"
  | "memberships:manage";

export const ROLE_DISPLAY_LABELS: Record<SystemRole, string> = {
  SUPER_ADMIN: "Platform Super Admin",
  INSTITUTION_ADMIN: "Institution Administrator",
  EXAM_CONTROLLER: "Exam Controller",
  EXAMINER: "Faculty / Question Setter",
  MODERATOR: "Reviewer / Approver",
  VIEWER: "Read-Only Viewer",
};

/**
 * Explicit permission matrix per role:
 *
 * 1. INSTITUTION_ADMIN:
 *    - Manage institution memberships & users (`memberships:manage`)
 *    - Manage academic structure, questions, examinations, papers, approvals, and PDFs
 *    - Still bound by independent-review invariant (`submittedBy !== reviewerId`)
 *
 * 2. EXAM_CONTROLLER:
 *    - Manage examination configurations (`exams:manage`)
 *    - Prepare and submit examination papers (`papers:prepare`, `papers:submit`)
 *    - Manage subjects/questions as needed for exam assembly (`subjects:manage`, `questions:write`)
 *    - Generate and download approved PDFs (`pdf:generate`, `pdf:download`)
 *    - CANNOT approve/reject submissions (`submissions:decide` omitted — cannot bypass independent review)
 *    - CANNOT manage institution memberships (`memberships:manage` omitted)
 *
 * 3. EXAMINER (Faculty / Question Setter):
 *    - Manage subjects, syllabus topics, and questions (`subjects:manage`, `questions:write`)
 *    - Run AI question generation and promote candidates (`ai:generate`, `ai:promote`)
 *    - Prepare and submit papers (`papers:prepare`, `papers:submit`) and manage exam configs (`exams:manage`)
 *    - View/download approved PDFs (`pdf:generate`, `pdf:download`)
 *    - CANNOT approve or reject submissions (`submissions:decide` omitted)
 *    - CANNOT manage institution memberships (`memberships:manage` omitted)
 *
 * 4. MODERATOR (Reviewer / Approver):
 *    - View subjects, questions, exams, papers, and approval queue
 *    - Approve, reject, or request changes on submitted papers (`submissions:decide`),
 *      subject to self-approval prohibition (`submittedBy !== reviewerId`)
 *    - Generate and download approved PDFs (`pdf:generate`, `pdf:download`)
 *    - CANNOT create/edit questions, run AI generation, or create/modify/submit papers
 *    - CANNOT manage institution memberships
 *
 * 5. VIEWER:
 *    - Read-only visibility across dashboard, subjects, questions, exams, papers, and submissions
 *    - CANNOT perform any mutations, approvals, or official PDF downloads
 */
export const ROLE_PERMISSIONS: Record<SystemRole, readonly Permission[]> = {
  SUPER_ADMIN: [
    "dashboard:view",
    "subjects:view",
    "subjects:manage",
    "questions:view",
    "questions:write",
    "ai:view",
    "ai:generate",
    "ai:promote",
    "exams:view",
    "exams:manage",
    "papers:view",
    "papers:prepare",
    "papers:submit",
    "submissions:view",
    "submissions:decide",
    "pdf:generate",
    "pdf:download",
    "memberships:manage",
  ],
  INSTITUTION_ADMIN: [
    "dashboard:view",
    "subjects:view",
    "subjects:manage",
    "questions:view",
    "questions:write",
    "ai:view",
    "ai:generate",
    "ai:promote",
    "exams:view",
    "exams:manage",
    "papers:view",
    "papers:prepare",
    "papers:submit",
    "submissions:view",
    "submissions:decide",
    "pdf:generate",
    "pdf:download",
    "memberships:manage",
  ],
  EXAM_CONTROLLER: [
    "dashboard:view",
    "subjects:view",
    "subjects:manage",
    "questions:view",
    "questions:write",
    "ai:view",
    "exams:view",
    "exams:manage",
    "papers:view",
    "papers:prepare",
    "papers:submit",
    "submissions:view",
    "pdf:generate",
    "pdf:download",
  ],
  EXAMINER: [
    "dashboard:view",
    "subjects:view",
    "subjects:manage",
    "questions:view",
    "questions:write",
    "ai:view",
    "ai:generate",
    "ai:promote",
    "exams:view",
    "exams:manage",
    "papers:view",
    "papers:prepare",
    "papers:submit",
    "submissions:view",
    "pdf:generate",
    "pdf:download",
  ],
  MODERATOR: [
    "dashboard:view",
    "subjects:view",
    "questions:view",
    "ai:view",
    "exams:view",
    "papers:view",
    "submissions:view",
    "submissions:decide",
    "pdf:generate",
    "pdf:download",
  ],
  VIEWER: [
    "dashboard:view",
    "subjects:view",
    "questions:view",
    "ai:view",
    "exams:view",
    "papers:view",
    "submissions:view",
  ],
};

export function isValidSystemRole(role: string | null | undefined): role is SystemRole {
  if (!role) return false;
  return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role);
}

export function getPermissionsForRole(role: string | null | undefined): Permission[] {
  if (!isValidSystemRole(role)) return [];
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(
  role: string | null | undefined,
  permission: Permission,
): boolean {
  if (!isValidSystemRole(role)) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

