import { useState, useEffect, useCallback } from 'react';
import { bankingService, type TransactionLogEntry } from '../services/api';

const STATE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  INITIATED:  { label: 'Initiated',  color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)' },
  PREPARED:   { label: 'Prepared',   color: '#60a5fa', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.25)' },
  COMMITTED:  { label: 'Committed',  color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.25)' },
  ABORTED:    { label: 'Aborted',    color: '#f87171', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)' },
};

const BRANCH_META: Record<string, { icon: string; color: string }> = {
  NORTH:   { icon: '🏔', color: '#38bdf8' },
  SOUTH:   { icon: '🌴', color: '#fbbf24' },
  EAST:    { icon: '🌅', color: '#34d399' },
  WEST:    { icon: '🌄', color: '#a78bfa' },
  CENTRAL: { icon: '🏛', color: '#d4a843' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

interface LedgerPanelProps {
  limit?: number;
}

export default function LedgerPanel({ limit = 50 }: LedgerPanelProps) {
  const [txns, setTxns]           = useState<TransactionLogEntry[]>([]);
  const [filter, setFilter]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [autoRefresh, setAuto]    = useState(false);
  const [expanded, setExpanded]   = useState<string | null>(null);

  const fetchTxns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await bankingService.listTransactions(filter || undefined, limit);
      setTxns(data);
    } catch { /* silently fail if backend is down */ }
    finally { setLoading(false); }
  }, [filter, limit]);

  useEffect(() => { fetchTxns(); }, [fetchTxns]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchTxns, 3000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchTxns]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <select
          className="select"
          style={{ width: 'auto', minWidth: 180 }}
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="">All Transactions</option>
          <option value="INITIATED">Initiated</option>
          <option value="PREPARED">Prepared</option>
          <option value="COMMITTED">Committed</option>
          <option value="ABORTED">Aborted</option>
        </select>

        <button onClick={fetchTxns} disabled={loading} className="btn btn-ghost">
          {loading ? '⟳' : '↻ Refresh'}
        </button>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--t-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={e => setAuto(e.target.checked)}
            style={{ accentColor: 'var(--c-gold-500)', width: 14, height: 14 }}
          />
          Live (3s)
        </label>
      </div>

      {/* State legend */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {Object.entries(STATE_META).map(([k, m]) => (
          <button
            key={k}
            onClick={() => setFilter(filter === k ? '' : k)}
            style={{
              padding: '3px 10px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 800,
              letterSpacing: '0.05em', cursor: 'pointer', border: `1px solid ${m.border}`,
              background: filter === k ? m.bg : 'transparent',
              color: filter === k ? m.color : 'var(--t-faint)',
              transition: 'all 0.15s',
            }}
          >
            {m.label.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="divider" />

      {/* Empty state */}
      {txns.length === 0 && !loading && (
        <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t-faint)', fontSize: '0.9rem' }}>
          No transactions found.
        </p>
      )}

      {/* Timeline */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        maxHeight: limit <= 5 ? 320 : 500, overflowY: 'auto', paddingRight: 4,
      }}>
        {txns.map(tx => {
          const sm = STATE_META[tx.state] ?? STATE_META['ABORTED'];
          const isOpen = expanded === tx.id;

          return (
            <div
              key={tx.id}
              onClick={() => setExpanded(isOpen ? null : tx.id)}
              className="glass-sm"
              style={{
                padding: '14px 18px', cursor: 'pointer',
                borderColor: isOpen ? sm.border : undefined,
                transition: 'border-color 0.2s',
              }}
            >
              {/* Row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{
                    flexShrink: 0, padding: '3px 11px', borderRadius: 99, fontSize: '0.62rem',
                    fontWeight: 800, letterSpacing: '0.04em',
                    background: sm.bg, color: sm.color, border: `1px solid ${sm.border}`,
                  }}>
                    {sm.label.toUpperCase()}
                  </span>

                  {/* Branch route */}
                  {tx.source_branch && tx.target_branch && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                      <span style={{ color: BRANCH_META[tx.source_branch]?.color ?? '#94a3b8', fontWeight: 700 }}>
                        {BRANCH_META[tx.source_branch]?.icon} {tx.source_branch}
                      </span>
                      <span style={{ color: 'var(--t-faint)' }}>→</span>
                      <span style={{ color: BRANCH_META[tx.target_branch]?.color ?? '#94a3b8', fontWeight: 700 }}>
                        {BRANCH_META[tx.target_branch]?.icon} {tx.target_branch}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                  {tx.amount != null && (
                    <span className="mono" style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--t-primary)' }}>
                      ${tx.amount.toFixed(2)}
                    </span>
                  )}
                  {tx.created_at && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--t-faint)' }}>
                      {timeAgo(tx.created_at)}
                    </span>
                  )}
                  <span style={{ color: 'var(--t-faint)', fontSize: '0.7rem' }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="mono" style={{ fontSize: '0.68rem', color: 'var(--t-faint)', wordBreak: 'break-all', marginBottom: 8 }}>
                    TX ID: {tx.id}
                  </p>
                  {tx.error && (
                    <div className="alert alert-error" style={{ fontSize: '0.75rem', padding: '8px 12px', marginBottom: 8 }}>
                      {tx.error}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 20, fontSize: '0.72rem', color: 'var(--t-secondary)', flexWrap: 'wrap' }}>
                    {tx.initiator_id && (
                      <span>By: {tx.initiator_id}</span>
                    )}
                    {tx.created_at && (
                      <span>Initiated: {new Date(tx.created_at).toLocaleString()}</span>
                    )}
                    {tx.updated_at && tx.state === 'COMMITTED' && (
                      <span style={{ color: '#34d399' }}>Settled: {new Date(tx.updated_at).toLocaleString()}</span>
                    )}
                    {tx.idempotency_key && (
                      <span className="mono" style={{ fontSize: '0.65rem', opacity: 0.7 }}>Key: {tx.idempotency_key}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
