import { useState } from 'react';
import { bankingService, type AccountCreate, BRANCHES } from '../services/api';

const BRANCH_META: Record<string, { label: string; icon: string; color: string }> = {
  NORTH:   { label: 'North Branch',   icon: '🏔', color: '#38bdf8' },
  SOUTH:   { label: 'South Branch',   icon: '🌴', color: '#fbbf24' },
  EAST:    { label: 'East Branch',    icon: '🌅', color: '#34d399' },
  WEST:    { label: 'West Branch',    icon: '🌄', color: '#a78bfa' },
  CENTRAL: { label: 'Central Branch', icon: '🏛', color: '#d4a843' },
};

interface AccountFormProps {
  prefillCustomerId?: string;
  onSuccess?: () => void;
}

export default function AccountForm({ prefillCustomerId = '', onSuccess }: AccountFormProps) {
  const [formData, setFormData] = useState<AccountCreate>({
    customer_id:     prefillCustomerId,
    branch:          'NORTH',
    initial_balance: 0,
  });
  const [status, setStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error';
    msg: string;
    accountNumber?: string;
  }>({ type: 'idle', msg: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: 'loading', msg: 'Opening account on branch node…' });
    try {
      const res = await bankingService.createAccount({
        ...formData,
        customer_id: formData.customer_id.trim().toUpperCase(),
      });
      setStatus({
        type: 'success',
        msg:  `Account opened at the ${BRANCH_META[res.branch]?.label ?? res.branch}.`,
        accountNumber: res.account_number,
      });
      onSuccess?.();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string }; status?: number }; message?: string };
      const detail = e.response?.data?.detail || e.message || 'Account creation failed.';
      setStatus({ type: 'error', msg: detail });
    }
  };

  const bm = BRANCH_META[formData.branch];

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Customer ID (read-only if prefilled, editable for admin) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label className="label">Customer ID</label>
          <input required type="text" className="input input-mono"
            value={formData.customer_id}
            onChange={e => setFormData(f => ({ ...f, customer_id: e.target.value.toUpperCase() }))}
            placeholder="e.g. CUST-001"
            readOnly={!!prefillCustomerId}
            style={{ opacity: prefillCustomerId ? 0.6 : 1 }}
          />
          {prefillCustomerId && (
            <p style={{ margin: '4px 0 0', fontSize: '0.67rem', color: 'var(--t-faint)' }}>
              Logged-in customer
            </p>
          )}
        </div>
        <div>
          <label className="label">Opening Deposit ($)</label>
          <input required type="number" min="0" step="0.01" className="input input-mono"
            value={formData.initial_balance || ''}
            onChange={e => setFormData(f => ({ ...f, initial_balance: parseFloat(e.target.value) || 0 }))}
            placeholder="0.00" />
        </div>
      </div>

      {/* Branch selector */}
      <div>
        <label className="label">Home Branch</label>
        <select className="select" value={formData.branch}
          onChange={e => setFormData(f => ({ ...f, branch: e.target.value as AccountCreate['branch'] }))}>
          {BRANCHES.map(b => (
            <option key={b} value={b}>
              {BRANCH_META[b]?.icon}  {BRANCH_META[b]?.label ?? b}
            </option>
          ))}
        </select>
      </div>

      {/* Branch info pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        borderRadius: 10,
        background: `${bm?.color ?? '#94a3b8'}0d`,
        border: `1px solid ${bm?.color ?? '#94a3b8'}22`,
      }}>
        <span style={{ fontSize: '1.2rem' }}>{bm?.icon}</span>
        <div>
          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: bm?.color ?? '#94a3b8' }}>
            {bm?.label}
          </p>
          <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--t-faint)' }}>
            Account number:&nbsp;
            <span className="mono" style={{ color: 'var(--t-muted)' }}>
              ACC-{(formData.customer_id || '???').toUpperCase()}-{formData.branch}
            </span>
          </p>
        </div>
      </div>

      <button type="submit" disabled={status.type === 'loading'} className="btn btn-gold" style={{ padding: '13px 24px' }}>
        {status.type === 'loading' ? '⏳ Opening Account…' : '✦  Open Account'}
      </button>

      {status.type !== 'idle' && (
        <div className={`alert ${status.type === 'success' ? 'alert-success' : status.type === 'loading' ? 'alert-loading' : 'alert-error'}`}>
          <p style={{ margin: 0, fontWeight: 600 }}>{status.msg}</p>
          {status.accountNumber && (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: '0 0 5px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', opacity: 0.7 }}>
                Account Number
              </p>
              <p className="mono" style={{
                margin: 0, fontSize: '0.9rem', padding: '7px 12px', borderRadius: 7,
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(52,211,153,0.2)',
                color: '#6ee7b7', letterSpacing: '0.04em',
              }}>
                {status.accountNumber}
              </p>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
