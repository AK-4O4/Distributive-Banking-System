import { useState } from 'react';
import { bankingService, setApiKey } from '../services/api';
import { useAuth } from '../context/AuthContext';

/* ── Hardcoded admin credentials (frontend-only gate) ── */
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

type Mode = 'customer' | 'admin';

export default function LoginPage() {
  const { loginAsCustomer, loginAsAdmin } = useAuth();
  const [mode, setMode]     = useState<Mode>('customer');

  /* Customer form */
  const [custId, setCustId]   = useState('');
  const [custPass, setCustPass] = useState('');

  /* Admin form */
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');

  /* API key (hidden from customers) */
  const [apiKey, setApiKeyLocal]       = useState('dev-secret-key-change-in-production');
  const [showApiInput, setShowApiInput] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  /* ── Customer login ── */
  const handleCustomerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custId.trim()) { setError('Please enter your Customer ID.'); return; }
    if (custPass.length < 4) { setError('Password must be at least 4 characters.'); return; }

    setLoading(true);
    setError('');
    try {
      setApiKey(apiKey);
      const res = await bankingService.findCustomerAcrossBranches(custId.trim());
      if (res.total_accounts === 0) {
        setError('No accounts found for this Customer ID. Please check your credentials or open an account.');
        return;
      }
      const name = res.accounts[0]?.customer_name ?? custId.toUpperCase();
      loginAsCustomer(res.customer_id, name, res.accounts);
    } catch {
      setError('Unable to connect to banking system. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ── Admin login ── */
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminUser === ADMIN_USER && adminPass === ADMIN_PASS) {
      setApiKey(apiKey);
      loginAsAdmin();
    } else {
      setError('Invalid admin credentials.');
    }
  };

  return (
    <div className="login-bg">

      {/* Admin Access button — top right */}
      <div style={{ position: 'absolute', top: 24, right: 28, display: 'flex', gap: 10, zIndex: 10 }}>
        {showApiInput ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKeyLocal(e.target.value)}
              className="input input-mono"
              style={{ width: 220, padding: '7px 12px', fontSize: '0.78rem' }}
              placeholder="API key…"
            />
            <button onClick={() => setShowApiInput(false)} className="btn btn-ghost" style={{ padding: '7px 12px' }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setShowApiInput(true)} className="btn btn-ghost" style={{ fontSize: '0.75rem' }}>
            🔑 API Key
          </button>
        )}

        <button
          onClick={() => { setMode(mode === 'admin' ? 'customer' : 'admin'); setError(''); }}
          className="btn btn-ghost"
          style={{
            fontSize: '0.78rem', fontWeight: 700,
            borderColor: mode === 'admin' ? 'rgba(212,160,23,0.4)' : undefined,
            color: mode === 'admin' ? 'var(--c-gold-400)' : undefined,
          }}
        >
          {mode === 'admin' ? '← Customer Login' : '⚙ Admin Access'}
        </button>
      </div>

      {/* Card */}
      <div className="login-card fade-in">

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18,
            background: 'linear-gradient(135deg, #d4a017, #e8bc3a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, marginBottom: 16,
            boxShadow: '0 8px 32px rgba(212,160,23,0.35)',
          }}>
            🏛
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
            Distributive<span className="text-gold">Bank</span>
          </h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--t-muted)', marginTop: 6, textAlign: 'center' }}>
            {mode === 'customer'
              ? 'Secure multi-branch banking portal'
              : 'System Administrator Access'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 18 }}>
            {error}
          </div>
        )}

        {/* ── Customer Login Form ── */}
        {mode === 'customer' && (
          <form onSubmit={handleCustomerLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Customer ID</label>
              <input
                required
                type="text"
                className="input input-mono"
                value={custId}
                onChange={e => { setCustId(e.target.value); setError(''); }}
                placeholder="e.g. CUST-001"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                required
                type="password"
                className="input"
                value={custPass}
                onChange={e => { setCustPass(e.target.value); setError(''); }}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-gold"
              style={{ marginTop: 6, padding: '13px 24px', fontSize: '0.9rem' }}
            >
              {loading ? '⏳ Signing in…' : '→  Sign In'}
            </button>
          </form>
        )}

        {/* ── Admin Login Form ── */}
        {mode === 'admin' && (
          <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Administrator Username</label>
              <input
                required
                type="text"
                className="input input-mono"
                value={adminUser}
                onChange={e => { setAdminUser(e.target.value); setError(''); }}
                placeholder="admin"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="label">Administrator Password</label>
              <input
                required
                type="password"
                className="input"
                value={adminPass}
                onChange={e => { setAdminPass(e.target.value); setError(''); }}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              className="btn btn-gold"
              style={{ marginTop: 6, padding: '13px 24px', fontSize: '0.9rem' }}
            >
              → Admin Sign In
            </button>
          </form>
        )}

        {/* Footer hint */}
        <p style={{ textAlign: 'center', marginTop: 28, fontSize: '0.72rem', color: 'var(--t-faint)' }}>
          {mode === 'customer'
            ? 'Your data is secured by Two-Phase Commit across all branch nodes.'
            : 'Credentials: admin / admin123'}
        </p>
      </div>

      {/* Branch dots — bottom of screen */}
      <div style={{
        position: 'absolute', bottom: 28, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 24, alignItems: 'center',
      }}>
        {[
          { label: 'North', color: '#38bdf8' },
          { label: 'South', color: '#fbbf24' },
          { label: 'East',  color: '#34d399' },
          { label: 'West',  color: '#a78bfa' },
          { label: 'Central', color: '#d4a843' },
        ].map((b, i) => (
          <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
            className={`fade-in stagger-${Math.min(i + 1, 4)}`}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: b.color, boxShadow: `0 0 10px ${b.color}66`,
            }} className="pulse-dot" />
            <span style={{ fontSize: '0.62rem', color: 'var(--t-faint)', letterSpacing: '0.04em' }}>
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
