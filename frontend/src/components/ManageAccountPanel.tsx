import { useState } from 'react';
import { bankingService, type AccountResponse, type Branch } from '../services/api';

interface ManageAccountPanelProps {
  account: AccountResponse;
  onClose: () => void;
  onUpdated: (updated: AccountResponse) => void;
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE',   label: 'Active',      icon: '✓', color: 'var(--c-emerald-lt)', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)' },
  { value: 'FROZEN',   label: 'Frozen',      icon: '❄', color: 'var(--c-blue-lt)',    bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.25)' },
  { value: 'INACTIVE', label: 'Inactive',    icon: '○', color: 'var(--t-secondary)',  bg: 'rgba(148,163,184,0.07)',border: 'rgba(148,163,184,0.15)' },
];

export default function ManageAccountPanel({ account, onClose, onUpdated }: ManageAccountPanelProps) {
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirm, setConfirm]   = useState<string | null>(null); // status pending confirmation

  const applyStatus = async (newStatus: string) => {
    setLoading(true);
    setResult(null);
    setConfirm(null);
    try {
      await bankingService.updateAccountStatus(account.branch_id as Branch, account.id, newStatus);
      setResult({ ok: true, msg: `Account status updated to ${newStatus}.` });
      onUpdated({ ...account, status: newStatus });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setResult({ ok: false, msg: e.response?.data?.detail || e.message || 'Update failed.' });
    } finally {
      setLoading(false);
    }
  };

  const BRANCH_META: Record<string, { icon: string; color: string }> = {
    north:   { icon: '🏔', color: '#38bdf8' },
    south:   { icon: '🌴', color: '#fbbf24' },
    east:    { icon: '🌅', color: '#34d399' },
    west:    { icon: '🌄', color: '#a78bfa' },
    central: { icon: '🏛', color: '#d4a843' },
  };
  const bm = BRANCH_META[account.branch_id] ?? { icon: '🏦', color: '#94a3b8' };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--t-primary)' }}>
            Manage Account
          </h2>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px 12px' }}>✕</button>
        </div>

        {/* Account info */}
        <div style={{
          padding: '18px 20px', borderRadius: 14, marginBottom: 24,
          background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: '1.4rem' }}>{bm.icon}</span>
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: 'var(--t-primary)' }}>{account.customer_name}</p>
              <p className="mono" style={{ margin: 0, fontSize: '0.72rem', color: 'var(--t-muted)' }}>
                {account.customer_id}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p className="label" style={{ marginBottom: 3 }}>Available Balance</p>
              <p className="mono" style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--c-gold-400)' }}>
                ${account.available_balance.toFixed(2)}
              </p>
            </div>
            <div style={{
              padding: '4px 14px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 800,
              background: account.status === 'ACTIVE' ? 'rgba(16,185,129,0.12)'
                : account.status === 'FROZEN' ? 'rgba(59,130,246,0.12)'
                : 'rgba(148,163,184,0.1)',
              color: account.status === 'ACTIVE' ? 'var(--c-emerald-lt)'
                : account.status === 'FROZEN' ? 'var(--c-blue-lt)'
                : 'var(--t-secondary)',
            }}>
              {account.status}
            </div>
          </div>
          <p className="mono" style={{ margin: '10px 0 0', fontSize: '0.68rem', color: 'var(--t-faint)', wordBreak: 'break-all' }}>
            ID: {account.id}
          </p>
        </div>

        {/* Status options */}
        <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--t-secondary)', marginBottom: 14 }}>
          Change Account Status
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {STATUS_OPTIONS.map(opt => {
            const isCurrent = account.status === opt.value;
            const isPending = confirm === opt.value;
            return (
              <div key={opt.value} style={{
                padding: '14px 16px', borderRadius: 12,
                background: isCurrent ? opt.bg : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isCurrent ? opt.border : 'rgba(255,255,255,0.06)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1rem', color: opt.color }}>{opt.icon}</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: isCurrent ? opt.color : 'var(--t-secondary)' }}>
                      {opt.label}
                      {isCurrent && <span style={{ fontSize: '0.65rem', marginLeft: 8, opacity: 0.7 }}>CURRENT</span>}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--t-faint)' }}>
                      {opt.value === 'ACTIVE'   ? 'Account fully operational. Transfers allowed.' :
                       opt.value === 'FROZEN'   ? 'All transactions blocked. Balance preserved.' :
                       'Account closed. No transactions possible.'}
                    </p>
                  </div>
                </div>

                {!isCurrent && (
                  isPending ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => applyStatus(opt.value)}
                        disabled={loading}
                        className="btn btn-ghost"
                        style={{ fontSize: '0.75rem', padding: '5px 12px', color: opt.color, borderColor: opt.border }}
                      >
                        {loading ? '…' : 'Confirm'}
                      </button>
                      <button onClick={() => setConfirm(null)} className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '5px 10px' }}>✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirm(opt.value)}
                      className="btn btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '5px 14px' }}
                    >
                      Set →
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>

        {result && (
          <div className={`alert ${result.ok ? 'alert-success' : 'alert-error'}`}>
            {result.msg}
          </div>
        )}
      </div>
    </>
  );
}
