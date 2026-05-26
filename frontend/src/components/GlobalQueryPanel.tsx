import { useState } from 'react';
import { bankingService, type AccountResponse } from '../services/api';

interface QueryResult {
  total_results:    number;
  branches_queried: string[];
  branch_errors:    Record<string, string>;
  accounts:         AccountResponse[];
  query_filter:     Record<string, unknown>;
}

const BRANCH_BADGE: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  north:   { color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',  border: 'rgba(56,189,248,0.25)',  icon: '🏔' },
  south:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)',  icon: '🌴' },
  east:    { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.25)',  icon: '🌅' },
  west:    { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)', icon: '🌄' },
  central: { color: '#d4a843', bg: 'rgba(212,168,67,0.1)',  border: 'rgba(212,168,67,0.25)',  icon: '🏛' },
};

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  ACTIVE:   { color: '#34d399', bg: 'rgba(52,211,153,0.1)'  },
  FROZEN:   { color: '#60a5fa', bg: 'rgba(59,130,246,0.1)'  },
  INACTIVE: { color: 'var(--t-secondary)', bg: 'rgba(148,163,184,0.08)' },
};

export default function GlobalQueryPanel() {
  const [customerId, setCustomerId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'INACTIVE' | 'FROZEN' | ''>('');
  const [minBalance, setMinBalance]     = useState('');
  const [result, setResult]             = useState<QueryResult | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [elapsed, setElapsed]           = useState<number | null>(null);

  const runQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(''); setResult(null);
    const t0 = performance.now();
    try {
      const res = await bankingService.globalQuery({
        customer_id: customerId || undefined,
        status:      statusFilter || undefined,
        min_balance: minBalance ? parseFloat(minBalance) : undefined,
      });
      setResult(res);
      setElapsed(performance.now() - t0);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e.response?.data?.detail || e.message || 'Search failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* Info bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
        borderRadius: 10, background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.14)',
      }}>
        <span>🔍</span>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--t-muted)' }}>
          Query is distributed to all 5 branch nodes simultaneously.
          Each node filters using its local indexes. Results merged by the coordinator.
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={runQuery} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <div>
            <label className="label">Customer ID</label>
            <input type="text" className="input input-mono"
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              placeholder="e.g. CUST-001"
            />
          </div>
          <div>
            <label className="label">Account Status</label>
            <select className="select"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="">Any Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="FROZEN">Frozen</option>
            </select>
          </div>
          <div>
            <label className="label">Minimum Balance ($)</label>
            <input type="number" min="0" step="0.01" className="input input-mono"
              value={minBalance}
              onChange={e => setMinBalance(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn btn-teal">
          {loading ? '⏳ Querying all branches…' : '🔍  Search All Branches'}
        </button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="fade-in">

          {/* Stats */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{
              padding: '7px 18px', borderRadius: 99,
              background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.2)',
            }}>
              <span className="mono" style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--c-gold-400)' }}>
                {result.total_results}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--t-muted)', marginLeft: 7 }}>
                account{result.total_results !== 1 ? 's' : ''} found
              </span>
            </div>
            {elapsed !== null && (
              <span style={{ fontSize: '0.75rem', color: 'var(--t-faint)' }}>
                ⚡ {elapsed.toFixed(0)}ms — parallel across {result.branches_queried.length} nodes
              </span>
            )}
            {Object.keys(result.branch_errors).length > 0 && (
              <span style={{ fontSize: '0.75rem', color: '#f87171' }}>
                ⚠ Node errors: {Object.keys(result.branch_errors).join(', ')}
              </span>
            )}
          </div>

          {/* Active filters */}
          {Object.keys(result.query_filter).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--t-faint)' }}>Filters applied:</span>
              {Object.entries(result.query_filter).map(([k, v]) => (
                <span key={k} className="badge badge-teal">
                  {k.replaceAll('_', ' ')}: {String(v)}
                </span>
              ))}
            </div>
          )}

          {/* Results table */}
          {result.accounts.length > 0 ? (
            <div className="table-wrap">
              <table className="bank-table">
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>Account Holder</th>
                    <th style={{ textAlign: 'right' }}>Available</th>
                    <th style={{ textAlign: 'right' }}>Locked</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.accounts.map(a => {
                    const bm = BRANCH_BADGE[a.branch_id] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)', icon: '🏦' };
                    const sm = STATUS_STYLE[a.status] ?? STATUS_STYLE['INACTIVE'];
                    return (
                      <tr key={a.id}>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 10px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700,
                            background: bm.bg, color: bm.color, border: `1px solid ${bm.border}`,
                          }}>
                            {bm.icon} {a.branch_id}
                          </span>
                        </td>
                        <td>
                          <p style={{ margin: 0, fontWeight: 600, color: 'var(--t-primary)' }}>{a.customer_name}</p>
                          <p className="mono" style={{ margin: 0, fontSize: '0.68rem', color: 'var(--t-faint)' }}>{a.customer_id}</p>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="mono" style={{ color: '#34d399', fontWeight: 700 }}>
                            ${a.available_balance.toFixed(2)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="mono" style={{ color: a.locked_balance > 0 ? '#fbbf24' : 'var(--t-faint)' }}>
                            {a.locked_balance > 0 ? `$${a.locked_balance.toFixed(2)}` : '—'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 10px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 800,
                            background: sm.bg, color: sm.color,
                          }}>
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t-faint)', fontSize: '0.9rem' }}>
              No accounts match your search across any branch.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
