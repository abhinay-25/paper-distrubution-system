import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  fetchCurrentSession,
  loginUser,
  logoutUser,
  switchActiveInstitution,
} from '../lib/api';
import { useInstitution } from './InstitutionContext';
import type {
  AuthenticatedUser,
  AuthSessionResponse,
  InstitutionMembershipSummary,
  Permission,
} from '../types/auth';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  activeMembership: InstitutionMembershipSummary | null;
  memberships: InstitutionMembershipSummary[];
  permissions: Permission[];
  loading: boolean;
  authenticated: boolean;
  hasPermission: (permission: Permission) => boolean;
  login: (input: {
    email: string;
    password: string;
    institutionId?: string;
  }) => Promise<AuthSessionResponse>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  switchInstitution: (institutionId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setInstitutionId, setInstitutionName } = useInstitution();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [activeMembership, setActiveMembership] =
    useState<InstitutionMembershipSummary | null>(null);
  const [memberships, setMemberships] = useState<InstitutionMembershipSummary[]>(
    [],
  );
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const applySession = useCallback(
    (session: AuthSessionResponse) => {
      setUser(session.user);
      setActiveMembership(session.activeMembership);
      setMemberships(session.memberships);
      setPermissions(session.permissions);
      setInstitutionId(session.activeMembership.institutionId);
      setInstitutionName(session.activeMembership.institution.name);
    },
    [setInstitutionId, setInstitutionName],
  );

  const clearSessionState = useCallback(() => {
    setUser(null);
    setActiveMembership(null);
    setMemberships([]);
    setPermissions([]);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const session = await fetchCurrentSession();
      applySession(session);
    } catch {
      clearSessionState();
    } finally {
      setLoading(false);
    }
  }, [applySession, clearSessionState]);

  useEffect(() => {
    // Purge legacy development persona keys so headers are never spoofed
    localStorage.removeItem('pds_dev_user_id');
    localStorage.removeItem('pds_dev_user_role');
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(
    async (input: {
      email: string;
      password: string;
      institutionId?: string;
    }): Promise<AuthSessionResponse> => {
      const session = await loginUser(input);
      applySession(session);
      return session;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } finally {
      clearSessionState();
    }
  }, [clearSessionState]);

  const switchInstitution = useCallback(
    async (nextInstitutionId: string) => {
      const session = await switchActiveInstitution(nextInstitutionId);
      applySession(session);
    },
    [applySession],
  );

  const hasPermission = useCallback(
    (permission: Permission): boolean => {
      return permissions.includes(permission);
    },
    [permissions],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        activeMembership,
        memberships,
        permissions,
        loading,
        authenticated: Boolean(user && activeMembership),
        hasPermission,
        login,
        logout,
        refreshSession,
        switchInstitution,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

