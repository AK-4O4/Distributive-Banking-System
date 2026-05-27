import { useState } from 'react';
import { type AccountResponse } from '../services/api';
import ManageAccountPanel from './ManageAccountPanel';

const BRANCH_META: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  NORTH:   { icon: '🏔', color: '#38bdf8', bg: 'rgba(56,189,248,0.08)',  border: 'rgba(56,189,248,0.2)' },
  SOUTH:   { icon: '🌴', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.2)' },
  EAST:    { icon: '🌅', color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.2)' },
  WEST:    { icon: '🌄', color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)' },
  CENTRAL: { icon: '🏛', color: '#d4a843', bg: 'rgba(212,168,67,0.08)',  border: 'rgba(212,168,67,0.2)' },
};

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  ACTIVE:   { color: 'var(--c-emerald-lt)',  bg: 'rgba(16,185,129,0.12)' },
  FROZEN:   { color: 'var(--c-blue-lt)',     bg: 'rgba(59,130,246,0.12)' },
  INACTIVE: { color: 'var(--t-secondary)',   bg: 'rgba(148,163,184,0.1)' },
};

interface AccountCardProps {
  account: AccountResponse;
  onUpdated?: (updated: AccountResponse) => void;
  animClass?: string;
}

export default function AccountCard({ account, onUpdated, animClass }: AccountCardProps) {
  const [showManage, setShowManage] = useState(false);
  const [current, setCurrent]       = useState(account);

  const bm = BRANCH_META[current.branch] ?? { icon: '🏦', color: '#94a3b8', bg: 'rgba(148,163,184,0.05)', border: 'rgba(148,163,184,0.15)' };
  const sm = STATUS_COLORS[current.status]  ?? STATUS_COLORS['INACTIVE'];

  const handleUpdated = (updated: AccountResponse) => {
    setCurrent(updated);
    onUpdated?.(updated);
  };

  return (
    <>
      <div className={`account-card ${animClass ?? ''}`}>

        {/* Branch header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: bm.bg, border: `1px solid ${bm.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              {bm.icon}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: bm.color }}>
                {current.branch} Branch
              </p>
              <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--t-faint)' }}>
                {current.account_title || 'Savings Account'}
              </p>
            </div>
          </div>
          <span style={{
            padding: '3px 10px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 800,
            background: sm.bg, color: sm.color,
          }}>
            {current.status}
          </span>
        </div>

        {/* Balance */}
        <div style={{ marginBottom: 16 }}>
          <p className="label" style={{ marginBottom: 4 }}>Available Balance</p>
          <p className="mono" style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: 'var(--t-primary)', letterSpacing: '-0.02em' }}>
            ${current.available_balance.toFixed(2)}
          </p>
          {current.locked_balance > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--c-amber-lt)' }}>
              ⚠ ${current.locked_balance.toFixed(2)} pending transfer
            </p>
          )}
        </div>

        {/* Account Number */}
        <p className="mono" style={{ margin: '0 0 14px', fontSize: '0.68rem', color: 'var(--t-faint)', wordBreak: 'break-all' }}>
          {current.account_number || current.id}
        </p>

        <div className="divider" style={{ marginBottom: 14 }} />

        {/* Actions */}
        <button
          onClick={() => setShowManage(true)}
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem' }}
        >
          ⚙ Manage Account
        </button>
      </div>

      {showManage && (
        <ManageAccountPanel
          account={current}
          onClose={() => setShowManage(false)}
          onUpdated={handleUpdated}
        />
      )}
    </>
  );
}
