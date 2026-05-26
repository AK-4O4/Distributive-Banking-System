import { useAuth, type CustomerSection } from '../context/AuthContext';
import NodeHealthPanel from '../components/NodeHealthPanel';

const CUSTOMER_NAV: { id: CustomerSection; label: string; icon: string }[] = [
  { id: 'dashboard',    label: 'Dashboard',      icon: '◈' },
  { id: 'transfer',     label: 'Fund Transfer',   icon: '⇄' },
  { id: 'history',      label: 'Transactions',    icon: '📋' },
  { id: 'open-account', label: 'Open Account',    icon: '＋' },
];

const ADMIN_NAV_LABELS: { id: string; label: string; icon: string }[] = [
  { id: 'health',       label: 'Branch Network',  icon: '◉' },
  { id: 'search',       label: 'Account Search',  icon: '🔍' },
  { id: 'ledger',       label: 'Global Ledger',   icon: '📋' },
  { id: 'open-account', label: 'Open Account',    icon: '＋' },
];

interface SidebarProps {
  mode: 'customer' | 'admin';
}

export default function Sidebar({ mode }: SidebarProps) {
  const {
    customerName, customerId,
    customerSection, adminSection,
    setCustomerSection, setAdminSection,
    logout,
  } = useAuth();

  const nav     = mode === 'customer' ? CUSTOMER_NAV : ADMIN_NAV_LABELS;
  const active  = mode === 'customer' ? customerSection : adminSection;
  const setActive = (id: string) =>
    mode === 'customer'
      ? setCustomerSection(id as CustomerSection)
      : setAdminSection(id as import('../context/AuthContext').AdminSection);

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 18 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #d4a017, #e8bc3a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, boxShadow: '0 4px 14px rgba(212,160,23,0.3)',
          }}>🏛</div>
          <div>
            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--t-primary)' }}>
              Distributive<span className="text-gold">Bank</span>
            </p>
            <p style={{ margin: 0, fontSize: '0.6rem', color: 'var(--t-faint)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {mode === 'admin' ? 'Admin Portal' : 'Customer Portal'}
            </p>
          </div>
        </div>

        {/* Customer greeting */}
        {mode === 'customer' && (
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(212,160,23,0.07)',
            border: '1px solid rgba(212,160,23,0.12)',
          }}>
            <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--t-muted)' }}>Signed in as</p>
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--t-primary)' }}>
              {customerName ?? 'Customer'}
            </p>
            <p className="mono" style={{ margin: 0, fontSize: '0.7rem', color: 'var(--c-gold-400)' }}>
              {customerId}
            </p>
          </div>
        )}

        {mode === 'admin' && (
          <div style={{
            padding: '8px 14px', borderRadius: 10,
            background: 'rgba(239,68,68,0.07)',
            border: '1px solid rgba(239,68,68,0.15)',
          }}>
            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#f87171' }}>
              ⚙ Administrator
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'var(--t-muted)' }}>
              Full system access
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ padding: '14px 12px', flex: 1 }}>
        <p style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-faint)', padding: '0 6px', marginBottom: 8 }}>
          Navigation
        </p>
        {nav.map(item => (
          <button
            key={item.id}
            onClick={() => setActive(item.id)}
            className={`nav-item ${active === item.id ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* System status mini-panel */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <p style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-faint)', marginBottom: 10 }}>
          Branch Network
        </p>
        <NodeHealthPanel compact />
      </div>

      {/* Logout */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button onClick={logout} className="nav-item" style={{ color: '#f87171' }}>
          <span className="nav-icon">⎋</span>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
