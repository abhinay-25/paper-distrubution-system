export type SystemRole =
  | 'SUPER_ADMIN'
  | 'INSTITUTION_ADMIN'
  | 'EXAM_CONTROLLER'
  | 'EXAMINER'
  | 'MODERATOR'
  | 'VIEWER';

export const ROLE_DISPLAY_LABELS: Record<SystemRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  INSTITUTION_ADMIN: 'Institution Admin',
  EXAM_CONTROLLER: 'Exam Controller',
  EXAMINER: 'Faculty / Question Setter',
  MODERATOR: 'Paper Reviewer / Approver',
  VIEWER: 'Read-Only Viewer',
};

export type Permission =
  | 'dashboard:view'
  | 'subjects:view'
  | 'subjects:manage'
  | 'questions:view'
  | 'questions:write'
  | 'ai:view'
  | 'ai:generate'
  | 'ai:promote'
  | 'exams:view'
  | 'exams:manage'
  | 'papers:view'
  | 'papers:prepare'
  | 'papers:submit'
  | 'submissions:view'
  | 'submissions:decide'
  | 'pdf:generate'
  | 'pdf:download'
  | 'memberships:manage';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
}

export type AuthenticatedUser = AuthUser;

export interface AuthInstitutionMembership {
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
}

export type InstitutionMembershipSummary = AuthInstitutionMembership;

export interface AuthSessionResponse {
  user: AuthUser;
  activeMembership: AuthInstitutionMembership;
  memberships: AuthInstitutionMembership[];
  permissions: Permission[];
  csrfToken: string;
  sessionToken?: string;
}

export interface InstitutionMemberRecord {
  id: string;
  institutionId: string;
  userId: string;
  role: SystemRole;
  roleLabel: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  joinedAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    isActive: boolean;
    lastLoginAt: string | null;
    createdAt: string;
  };
}

export type InstitutionMemberDirectoryItem = InstitutionMemberRecord;

export interface ProvisionMemberInput {
  email: string;
  displayName: string;
  password: string;
  role: SystemRole;
}

export interface UpdateMembershipInput {
  role?: SystemRole;
  status?: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
}

