import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, AlertCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { TextInput } from '../components/ui/FormControls';
import { Badge } from '../components/ui/Badge';

interface DemoPersona {
  label: string;
  roleBadge: string;
  email: string;
  summary: string;
}

const DEMO_PERSONAS: DemoPersona[] = [
  {
    label: 'Institution Admin',
    roleBadge: 'INSTITUTION_ADMIN',
    email: 'admin@cbit.ac.in',
    summary: 'Full access including user & membership management',
  },
  {
    label: 'Controller of Examinations',
    roleBadge: 'EXAM_CONTROLLER',
    email: 'coe@cbit.ac.in',
    summary: 'Exam setup, paper preparation, approval & PDF release',
  },
  {
    label: 'Faculty / Question Setter',
    roleBadge: 'EXAMINER',
    email: 'examiner@cbit.ac.in',
    summary: 'Question bank authoring, AI generation & paper submission',
  },
  {
    label: 'Paper Reviewer / Approver',
    roleBadge: 'MODERATOR',
    email: 'moderator@cbit.ac.in',
    summary: 'Approval queue governance, review decisions & PDF generation',
  },
  {
    label: 'Read-Only Auditor',
    roleBadge: 'VIEWER',
    email: 'viewer@cbit.ac.in',
    summary: 'Read-only inspection across academic modules',
  },
];

export function LoginPage() {
  const { authenticated, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const intendedDestination =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname || '/';

  if (!loading && authenticated) {
    return <Navigate to={intendedDestination} replace />;
  }

  const validateForm = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      errors.email = 'Institutional email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Enter a valid institutional email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validateForm()) return;

    setSubmitting(true);
    try {
      await login({
        email: email.trim().toLowerCase(),
        password,
      });
      navigate(intendedDestination, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError(
          'Unable to reach the authentication server. Please verify the backend service is running.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectPersona = (personaEmail: string) => {
    setEmail(personaEmail);
    setPassword('CbitDemo@2026!');
    setFieldErrors({});
    setSubmitError(null);
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-canvas px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="grid overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-card lg:grid-cols-12">
          {/* Left column: Institutional branding & security posture */}
          <div className="flex flex-col justify-between border-b border-line bg-canvas-deep p-6 sm:p-8 lg:col-span-5 lg:border-b-0 lg:border-r">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent font-display text-sm font-bold tracking-wider text-white shadow-sm">
                  PDS
                </span>
                <div>
                  <p className="font-display text-sm font-bold tracking-tight text-ink">
                    Paper Distribution System
                  </p>
                  <p className="text-xs text-ink-muted">
                    Secure Examination Infrastructure
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Badge tone="accent">Institutional RBAC Enforced</Badge>
                <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
                  Academic Examination Portal
                </h1>
                <p className="text-body leading-relaxed text-ink-muted">
                  Sign in with your verified institutional credentials to access
                  question banks, AI synthesis, examination paper preparation,
                  and formal moderation workflows.
                </p>
              </div>

              <div className="space-y-3 rounded-xl border border-line bg-surface-raised p-4 text-meta">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <div>
                    <p className="font-semibold text-ink">
                      Tenant-Isolated Access Control
                    </p>
                    <p className="text-ink-muted">
                      Every request is cryptographically bound to your verified
                      institution membership and role permissions.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <div>
                    <p className="font-semibold text-ink">
                      Separation of Duties
                    </p>
                    <p className="text-ink-muted">
                      Self-approval is strictly prohibited. Official PDF papers
                      require formal reviewer approval and SHA-256 verification.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p className="pt-6 text-xs text-ink-faint">
              Chaitanya Bharathi Institute of Technology (Autonomous) ·
              Examination Branch
            </p>
          </div>

          {/* Right column: Sign-in form + development demo account selector */}
          <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-7">
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl font-bold text-ink">
                  Sign in to your account
                </h2>
                <p className="mt-1 text-meta text-ink-muted">
                  Enter your institutional email and password to establish an
                  authenticated session.
                </p>
              </div>

              {submitError && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-tint p-3.5 text-meta text-danger"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Authentication failed</p>
                    <p>{submitError}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <TextInput
                  label="Institutional Email"
                  type="email"
                  autoComplete="email"
                  placeholder="examiner@cbit.ac.in"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }
                  }}
                  error={fieldErrors.email}
                  disabled={submitting}
                />

                <TextInput
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your account password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) {
                      setFieldErrors((prev) => ({
                        ...prev,
                        password: undefined,
                      }));
                    }
                  }}
                  error={fieldErrors.password}
                  disabled={submitting}
                />

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full justify-center"
                    disabled={submitting}
                  >
                    {submitting ? 'Signing in…' : 'Sign In'}
                  </Button>
                </div>
              </form>

              {import.meta.env.DEV && (
                <div className="space-y-3 border-t border-line pt-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      <Sparkles className="h-3.5 w-3.5 text-accent" />
                      <span>Seeded Institutional Accounts (Dev Mode)</span>
                    </div>
                    <span className="text-[11px] text-ink-faint">
                      Click to fill email
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {DEMO_PERSONAS.map((persona) => {
                      const isSelected =
                        email.trim().toLowerCase() === persona.email;
                      return (
                        <button
                          key={persona.email}
                          type="button"
                          onClick={() => handleSelectPersona(persona.email)}
                          className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors ${
                            isSelected
                              ? 'border-accent bg-accent-tint/50'
                              : 'border-line bg-canvas hover:border-line-strong hover:bg-surface-sunken/50'
                          }`}
                        >
                          <div className="flex w-full items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-ink">
                              {persona.label}
                            </span>
                            <span className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-muted">
                              {persona.roleBadge}
                            </span>
                          </div>
                          <span className="mt-0.5 font-mono text-[11px] text-accent">
                            {persona.email}
                          </span>
                          <span className="mt-1 line-clamp-1 text-[11px] text-ink-muted">
                            {persona.summary}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

