import { createContext, useContext, useState, ReactNode } from 'react';
import { type AccountResponse } from '../services/api';

// ── Types ────────────────────────────────────────────────────────────────────

export type AppView = 'login' | 'customer' | 'admin';
export type CustomerSection = 'dashboard' | 'transfer' | 'history' | 'open-account';
export type AdminSection    = 'health' | 'search' | 'ledger' | 'open-account';

interface AuthContextValue {
  view:              AppView;
  // Customer session
  customerId:        string | null;
  customerName:      string | null;
  customerAccounts:  AccountResponse[];
  // Admin session
  isAdmin:           boolean;
  // Navigation
  customerSection:   CustomerSection;
  adminSection:      AdminSection;
  // Actions
  loginAsCustomer:   (id: string, name: string, accounts: AccountResponse[]) => void;
  loginAsAdmin:      () => void;
  logout:            () => void;
  setCustomerSection: (s: CustomerSection) => void;
  setAdminSection:    (s: AdminSection) => void;
  refreshCustomerAccounts: (accounts: AccountResponse[]) => void;
}

// ── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [view, setView]                         = useState<AppView>('login');
  const [customerId, setCustomerId]             = useState<string | null>(null);
  const [customerName, setCustomerName]         = useState<string | null>(null);
  const [customerAccounts, setCustomerAccounts] = useState<AccountResponse[]>([]);
  const [isAdmin, setIsAdmin]                   = useState(false);
  const [customerSection, setCustomerSection]   = useState<CustomerSection>('dashboard');
  const [adminSection, setAdminSection]         = useState<AdminSection>('health');

  const loginAsCustomer = (id: string, name: string, accounts: AccountResponse[]) => {
    setCustomerId(id);
    setCustomerName(name);
    setCustomerAccounts(accounts);
    setIsAdmin(false);
    setCustomerSection('dashboard');
    setView('customer');
  };

  const loginAsAdmin = () => {
    setIsAdmin(true);
    setCustomerId(null);
    setCustomerName(null);
    setCustomerAccounts([]);
    setAdminSection('health');
    setView('admin');
  };

  const logout = () => {
    setCustomerId(null);
    setCustomerName(null);
    setCustomerAccounts([]);
    setIsAdmin(false);
    setView('login');
  };

  const refreshCustomerAccounts = (accounts: AccountResponse[]) => {
    setCustomerAccounts(accounts);
  };

  return (
    <AuthContext.Provider value={{
      view, customerId, customerName, customerAccounts, isAdmin,
      customerSection, adminSection,
      loginAsCustomer, loginAsAdmin, logout,
      setCustomerSection, setAdminSection,
      refreshCustomerAccounts,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
