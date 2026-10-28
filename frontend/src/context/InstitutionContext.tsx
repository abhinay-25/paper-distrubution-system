import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export const DEFAULT_DEV_INSTITUTION_ID = 'a0000000-0000-4000-8000-000000000001';
const STORAGE_KEY = 'pds_dev_institution_id';

interface InstitutionContextValue {
  institutionId: string;
  institutionName: string | null;
  setInstitutionId: (id: string) => void;
  setInstitutionName: (name: string | null) => void;
  resetInstitutionId: () => void;
}

const InstitutionContext = createContext<InstitutionContextValue | undefined>(undefined);

export function InstitutionProvider({ children }: { children: ReactNode }) {
  const [institutionId, setInstitutionIdState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_DEV_INSTITUTION_ID;
  });
  const [institutionName, setInstitutionName] = useState<string | null>(null);

  const setInstitutionId = (id: string) => {
    const trimmed = id.trim();
    if (trimmed !== institutionId) {
      setInstitutionName(null);
    }
    setInstitutionIdState(trimmed);
    localStorage.setItem(STORAGE_KEY, trimmed);
  };

  const resetInstitutionId = () => {
    if (institutionId !== DEFAULT_DEV_INSTITUTION_ID) {
      setInstitutionName(null);
    }
    setInstitutionIdState(DEFAULT_DEV_INSTITUTION_ID);
    localStorage.setItem(STORAGE_KEY, DEFAULT_DEV_INSTITUTION_ID);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, institutionId);
  }, [institutionId]);

  return (
    <InstitutionContext.Provider
      value={{
        institutionId,
        institutionName,
        setInstitutionId,
        setInstitutionName,
        resetInstitutionId,
      }}
    >
      {children}
    </InstitutionContext.Provider>
  );
}

export function useInstitution() {
  const context = useContext(InstitutionContext);
  if (!context) {
    throw new Error('useInstitution must be used within an InstitutionProvider');
  }
  return context;
}

/** Utility to retrieve active institution ID outside React components (e.g. in api.ts) */
export function getActiveInstitutionId(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_DEV_INSTITUTION_ID;
}
