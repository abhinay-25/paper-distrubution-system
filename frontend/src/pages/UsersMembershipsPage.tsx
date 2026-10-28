import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { UserPlus, Shield, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  fetchInstitutionMemberships,
  provisionInstitutionMember,
  updateInstitutionMembership,
  ApiError,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { TextInput, Select } from '../components/ui/FormControls';
import {
  ROLE_DISPLAY_LABELS,
  type InstitutionMemberDirectoryItem,
  type SystemRole,
} from '../types/auth';

const ASSIGNABLE_ROLES: { value: SystemRole; label: string }[] = [
  { value: 'INSTITUTION_ADMIN', label: 'Institution Admin (INSTITUTION_ADMIN)' },
  { value: 'EXAM_CONTROLLER', label: 'Exam Controller (EXAM_CONTROLLER)' },
  { value: 'EXAMINER', label: 'Faculty / Question Setter (EXAMINER)' },
  { value: 'MODERATOR', label: 'Reviewer / Approver (MODERATOR)' },
  { value: 'VIEWER', label: 'Read-Only Viewer (VIEWER)' },
];

export function UsersMembershipsPage() {
  const { activeMembership, user: currentUser } = useAuth();
  const [members, setMembers] = useState<InstitutionMemberDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Provision form state
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<SystemRole>('EXAMINER');
  const [provisioning, setProvisioning] = useState(false);

  // Inline update state
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInstitutionMemberships();
      setMembers(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load institution memberships.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers, activeMembership?.institutionId]);

  const handleProvision = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    if (!email.trim() || !displayName.trim() || password.length < 8) {
      setError(
        'Please provide a valid email, full name, and a password of at least 8 characters.',
      );
      return;
    }

    setProvisioning(true);
    try {
      await provisionInstitutionMember({
        email: email.trim().toLowerCase(),
        displayName: displayName.trim(),
        password,
        role,
      });
      setEmail('');
      setDisplayName('');
      setPassword('');
      setRole('EXAMINER');
      setFeedback(`Provisioned ${displayName.trim()} (${ROLE_DISPLAY_LABELS[role]})`);
      await loadMembers();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to provision institution member.');
      }
    } finally {
      setProvisioning(false);
    }
  };

  const handleRoleChange = async (
    membership: InstitutionMemberDirectoryItem,
    nextRole: SystemRole,
  ) => {
    if (membership.role === nextRole) return;
    setUpdatingId(membership.id);
    setError(null);
    setFeedback(null);
    try {
      await updateInstitutionMembership(membership.id, { role: nextRole });
      setFeedback(
        `Updated ${membership.user.displayName} role to ${ROLE_DISPLAY_LABELS[nextRole]}.`,
      );
      await loadMembers();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to update role.');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleActive = async (
    membership: InstitutionMemberDirectoryItem,
  ) => {
    setUpdatingId(membership.id);
    setError(null);
    setFeedback(null);
    const nextStatus = membership.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await updateInstitutionMembership(membership.id, {
        status: nextStatus,
      });
      setFeedback(
        `${nextStatus === 'SUSPENDED' ? 'Suspended' : 'Reactivated'} membership for ${membership.user.displayName}.`,
      );
      await loadMembers();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to update membership status.');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Institution Governance & RBAC"
        title="Users & Memberships"
        description={`Manage verified user accounts and role assignments for ${activeMembership?.institution.name || 'this institution'}.`}
        actions={
          <Button
            variant="secondary"
            onClick={() => void loadMembers()}
            disabled={loading}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger-tint p-4 text-meta text-danger"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-success/30 bg-success-tint p-4 text-meta text-success"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Provision Member Card */}
        <Card className="p-6 lg:col-span-4">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-tint text-accent">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-ink">
                Provision Member
              </h2>
              <p className="text-xs text-ink-muted">
                Assign or create an institutional user
              </p>
            </div>
          </div>

          <form onSubmit={handleProvision} className="space-y-4">
            <TextInput
              label="Full Name"
              placeholder="Dr. S. Venkata Rao"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={provisioning}
              required
            />
            <TextInput
              label="Institutional Email"
              type="email"
              placeholder="faculty@cbit.ac.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={provisioning}
              required
            />
            <TextInput
              label="Initial / Updated Password"
              type="password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={provisioning}
              required
            />
            <Select
              label="Institutional Role"
              value={role}
              onChange={(e) => setRole(e.target.value as SystemRole)}
              disabled={provisioning}
            >
              {ASSIGNABLE_ROLES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center"
              disabled={provisioning}
            >
              {provisioning ? 'Provisioning…' : 'Provision / Update Member'}
            </Button>
          </form>
        </Card>

        {/* Directory Table */}
        <Card className="overflow-hidden lg:col-span-8">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent" />
              <h2 className="font-display text-base font-bold text-ink">
                Active Institution Directory ({members.length})
              </h2>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-meta text-ink-muted">
              Loading institution memberships…
            </div>
          ) : members.length === 0 ? (
            <div className="p-8 text-center text-meta text-ink-muted">
              No memberships found for this institution.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-meta">
                <thead className="border-b border-line bg-canvas-deep text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-5 py-3 font-semibold">User</th>
                    <th className="px-5 py-3 font-semibold">Assigned Role</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {members.map((m) => {
                    const isSelf = m.user.id === currentUser?.id;
                    const isUpdating = updatingId === m.id;
                    const isActive = m.status === 'ACTIVE';
                    return (
                      <tr key={m.id} className="hover:bg-canvas/50">
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-ink">
                            {m.user.displayName}{' '}
                            {isSelf && (
                              <span className="ml-1 rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                                You
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-xs text-ink-muted">
                            {m.user.email}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <select
                            aria-label={`Role for ${m.user.displayName}`}
                            value={m.role}
                            disabled={isUpdating}
                            onChange={(e) =>
                              void handleRoleChange(
                                m,
                                e.target.value as SystemRole,
                              )
                            }
                            className="rounded-control border border-line-strong bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-ink"
                          >
                            {ASSIGNABLE_ROLES.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge tone={isActive ? 'success' : 'danger'}>
                            {isActive ? 'Active' : m.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            disabled={isUpdating || isSelf}
                            onClick={() => void handleToggleActive(m)}
                            className="text-xs font-medium text-ink-muted underline hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isActive ? 'Suspend' : 'Reactivate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

