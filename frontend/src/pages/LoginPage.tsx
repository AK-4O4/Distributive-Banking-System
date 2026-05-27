import { useState } from 'react';
import { bankingService } from '../services/api';
import { useAuth } from '../context/AuthContext';

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

type Mode    = 'customer' | 'admin' | 'register';
type RegStep = 'form' | 'success';

export default function LoginPage() {
  const { loginAsCustomer, loginAsAdmin } = useAuth();
  const [mode, setMode] = useState<Mode>('customer');

  // Customer login
  const [custId, setCustId]     = useState('');
  const [custPass, setCustPass] = useState('');

  // Admin login
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');

  // Registration
  const [regStep, setRegStep]       = useState<RegStep>('form');
  const [regId, setRegId]           = useState('');
  const [regName, setRegName]       = useState('');
  const [regPass, setRegPass]       = useState('');
  const [regPassConfirm, setRegPassConfirm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const clearError = () => setError('');

  // ── Customer login ─────────────────────────────────────────────────────────
  const handleCustomerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); clearError();
    try {
      const res = await bankingService.login(custId.trim(), custPass);
      loginAsCustomer(res.customer_id, res.customer_name, res.accounts);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string }; status?: number } };
      setError(e.response?.status === 401
        ? 'Invalid Customer ID or password.'
        : 'Unable to connect to banking system. Please try again.');
    } finally { setLoading(false); }
  };

  // ── Admin login ───────────────────────────────────────────────────────────
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminUser === ADMIN_USER && adminPass === ADMIN_PASS) {
      loginAsAdmin();
    } else {
      setError('Invalid administrator credentials.');
    }
  };

  // ── Registration ──────────────────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPass !== regPassConfirm) { setError('Passwords do not match.'); return; }
    if (regPass.length < 8)         { setError('Password must be at least 8 characters.'); return; }
    setLoading(true); clearError();
    try {
      await bankingService.registerCustomer({
        customer_id:   regId.trim().toUpperCase(),
        customer_name: regName.trim(),
        password:      regPass,
      });
      setRegStep('success');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Registration failed. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="login-bg">

      {/* Top-right buttons */}
      <div style={{ position: 'absolute', top: 24, right: 28, zIndex: 10, display: 'flex', gap: 10 }}>
        {mode !== 'register' && (
          <button
            onClick={() => { setMode('register'); clearError(); }}
            className="btn btn-ghost"
            style={{ fontSize: '0.75rem' }}
          >
            + Register
          </button>
        )}
        <button
          onClick={() => { setMode(mode === 'admin' ? 'customer' : 'admin'); clearError(); }}
          className="btn btn-ghost"
          style={{
            fontSize: '0.78rem', fontWeight: 700,
            borderColor: mode === 'admin' ? 'rgba(212,160,23,0.4)' : undefined,
            color:       mode === 'admin' ? 'var(--c-gold-400)' : undefined,
          }}
        >
          {mode === 'admin' ? '← Customer Login' : '⚙  Admin Access'}
        </button>
      </div>

      {/* Card */}
      <div className="login-card fade-in">

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18,
            background: 'linear-gradient(135deg, #d4a017, #e8bc3a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, marginBottom: 16, boxShadow: '0 8px 32px rgba(212,160,23,0.35)',
          }}>🏛</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
            Distributive<span className="text-gold">Bank</span>
          </h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--t-muted)', marginTop: 6, textAlign: 'center' }}>
            {mode === 'admin'    ? 'System Administrator Access' :
             mode === 'register' ? 'Create your customer account' :
             'Secure multi-branch banking portal'}
          </p>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        {/* ── Customer login ── */}
        {mode === 'customer' && (
          <form onSubmit={handleCustomerLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Customer ID</label>
              <input required type="text" className="input input-mono"
                value={custId} onChange={e => { setCustId(e.target.value); clearError(); }}
                placeholder="e.g. CUST-001" autoComplete="username" />
            </div>
            <div>
              <label className="label">Password</label>
              <input required type="password" className="input"
                value={custPass} onChange={e => { setCustPass(e.target.value); clearError(); }}
                placeholder="Enter your password" autoComplete="current-password" />
            </div>
            <button type="submit" disabled={loading} className="btn btn-gold"
              style={{ marginTop: 6, padding: '13px 24px', fontSize: '0.9rem' }}>
              {loading ? '⏳ Signing in…' : '→  Sign In'}
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--t-faint)' }}>
              No account?&nbsp;
              <button type="button" onClick={() => { setMode('register'); clearError(); }}
                style={{ background: 'none', border: 'none', color: 'var(--c-gold-400)', cursor: 'pointer', fontSize: '0.72rem', padding: 0 }}>
                Register here
              </button>
            </p>
          </form>
        )}

        {/* ── Admin login ── */}
        {mode === 'admin' && (
          <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Administrator Username</label>
              <input required type="text" className="input input-mono"
                value={adminUser} onChange={e => { setAdminUser(e.target.value); clearError(); }}
                placeholder="admin" autoComplete="username" />
            </div>
            <div>
              <label className="label">Administrator Password</label>
              <input required type="password" className="input"
                value={adminPass} onChange={e => { setAdminPass(e.target.value); clearError(); }}
                placeholder="••••••••" autoComplete="current-password" />
            </div>
            <button type="submit" className="btn btn-gold"
              style={{ marginTop: 6, padding: '13px 24px', fontSize: '0.9rem' }}>
              →  Admin Sign In
            </button>
          </form>
        )}

        {/* ── Register ── */}
        {mode === 'register' && regStep === 'form' && (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Full Name</label>
                <input required type="text" className="input"
                  value={regName} onChange={e => { setRegName(e.target.value); clearError(); }}
                  placeholder="Jane Doe" />
              </div>
              <div>
                <label className="label">Customer ID</label>
                <input required type="text" className="input input-mono"
                  value={regId} onChange={e => { setRegId(e.target.value.toUpperCase()); clearError(); }}
                  placeholder="CUST-001" pattern="[A-Za-z0-9_-]+" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Password <span style={{ opacity: 0.5 }}>(8+ chars)</span></label>
                <input required type="password" className="input" minLength={8}
                  value={regPass} onChange={e => { setRegPass(e.target.value); clearError(); }}
                  placeholder="Min 8 characters" />
              </div>
              <div>
                <label className="label">Confirm Password</label>
                <input required type="password" className="input"
                  value={regPassConfirm} onChange={e => { setRegPassConfirm(e.target.value); clearError(); }}
                  placeholder="Re-enter password" />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn btn-gold"
              style={{ padding: '13px 24px', fontSize: '0.9rem' }}>
              {loading ? '⏳ Registering…' : '✦  Create Account'}
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--t-faint)' }}>
              Already registered?&nbsp;
              <button type="button" onClick={() => { setMode('customer'); clearError(); setRegStep('form'); }}
                style={{ background: 'none', border: 'none', color: 'var(--c-gold-400)', cursor: 'pointer', fontSize: '0.72rem', padding: 0 }}>
                Sign in
              </button>
            </p>
          </form>
        )}

        {/* ── Registration success ── */}
        {mode === 'register' && regStep === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <p style={{ fontWeight: 700, color: '#34d399', marginBottom: 8 }}>
              Registration Successful!
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--t-secondary)', marginBottom: 20 }}>
              Welcome, <strong>{regName}</strong>!
              Your Customer ID is&nbsp;
              <span className="mono" style={{ color: 'var(--c-gold-400)' }}>{regId.toUpperCase()}</span>.
              <br />Now sign in and open your first branch account.
            </p>
            <button className="btn btn-gold" onClick={() => { setMode('customer'); setRegStep('form'); setCustId(regId.toUpperCase()); }}>
              → Sign In Now
            </button>
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.7rem', color: 'var(--t-faint)' }}>
          {mode !== 'register'
            ? 'Secured by Two-Phase Commit across all branch nodes.'
            : 'Your identity is stored in the global customer registry.'}
        </p>
      </div>

      {/* Branch dots */}
      <div style={{ position: 'absolute', bottom: 28, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 24, alignItems: 'center' }}>
        {[
          { label: 'North',   color: '#38bdf8' },
          { label: 'South',   color: '#fbbf24' },
          { label: 'East',    color: '#34d399' },
          { label: 'West',    color: '#a78bfa' },
          { label: 'Central', color: '#d4a843' },
        ].map((b, i) => (
          <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
            className={`fade-in stagger-${Math.min(i + 1, 4)}`}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: b.color, boxShadow: `0 0 10px ${b.color}66` }} className="pulse-dot" />
            <span style={{ fontSize: '0.62rem', color: 'var(--t-faint)', letterSpacing: '0.04em' }}>{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
