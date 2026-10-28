import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UnauthorizedPage } from '../../pages/UnauthorizedPage';
import type { Permission } from '../../types/auth';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: Permission;
}

export function ProtectedRoute({
  children,
  requiredPermission,
}: ProtectedRouteProps) {
  const { authenticated, loading, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-ink-muted">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-accent"
          aria-hidden="true"
        />
        <p className="text-meta font-medium">Verifying institutional session…</p>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <UnauthorizedPage requiredPermission={requiredPermission} />;
  }

  return <>{children}</>;
}

