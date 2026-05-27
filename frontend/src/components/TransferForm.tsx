import { useState, useEffect } from 'react';
import { bankingService, type TransferRequest, type AccountResponse, BRANCHES, type Branch } from '../services/api';

const BRANCH_META: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
  NORTH:   { label: 'North',   icon: '🏔', color: '#38bdf8', bg: 'rgba(56,189,248,0.07)',  border: 'rgba(56,189,248,0.18)' },
  SOUTH:   { label: 'South',   icon: '🌴', color: '#fbbf24', bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.18)' },
  EAST:    { label: 'East',    icon: '🌅', color: '#34d399', bg: 'rgba(52,211,153,0.07)',  border: 'rgba(52,211,153,0.18)' },
  WEST:    { label: 'West',    icon: '🌄', color: '#a78bfa', bg: 'rgba(167,139,250,0.07)', border: 'rgba(167,139,250,0.18)' },
  CENTRAL: { label: 'Central', icon: '🏛', color: '#d4a843', bg: 'rgba(212,168,67,0.07)',  border: 'rgba(212,168,67,0.18)' },
};

const PHASES = ['INITIATED', 'PREPARED', 'COMMITTED'] as const;

interface TransferFormProps {
  preloadedSourceAccounts?: AccountResponse[];
}

export default function TransferForm({ preloadedSourceAccounts = [] }: TransferFormProps) {
  const [formData, setFormData] = useState<TransferRequest>({
    initiator_id:      'banking_portal',
    source_branch:     'NORTH',
    source_account_id: '',
    target_branch:     'SOUTH',
    target_account_id: '',
    amount:            0,
    idempotency_key:   '',   // auto-generated on submit
  });
  const [status, setStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error';
    msg: string; txId?: string; phase?: string;
  }>({ type: 'idle', msg: '' });

  const [sourceAccounts, setSourceAccounts] = useState<AccountResponse[]>([]);
  const [targetAccounts, setTargetAccounts] = useState<AccountResponse[]>([]);
  const [loadingSource, setLoadingSource]   = useState(false);
  const [loadingTarget, setLoadingTarget]   = useState(false);

  /* Pre-load source accounts from customer dashboard context */
  useEffect(() => {
    if (preloadedSourceAccounts.length > 0) {
      const active = preloadedSourceAccounts.filter(a => a.status === 'ACTIVE');
      setSourceAccounts(active);
      if (active[0]) {
        setFormData(f => ({ ...f, source_branch: active[0].branch as Branch, source_account_id: active[0].id }));
      }
    }
  }, [preloadedSourceAccounts]);

  const fetchAccounts = async (branch: Branch, side: 'source' | 'target') => {
    const setLoading  = side === 'source' ? setLoadingSource : setLoadingTarget;
    const setAccounts = side === 'source' ? setSourceAccounts : setTargetAccounts;
    const field       = side === 'source' ? 'source_account_id' : 'target_account_id';
    const branchField = side === 'source' ? 'source_branch' : 'target_branch';

    setLoading(true); setAccounts([]);
    setFormData(f => ({ ...f, [branchField]: branch, [field]: '' }));
    try {
      const accs = await bankingService.listAccounts(branch, 'ACTIVE');
      setAccounts(accs);
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.source_account_id) { setStatus({ type: 'error', msg: 'Please select a source account.' }); return; }
    if (!formData.target_account_id) { setStatus({ type: 'error', msg: 'Please select a recipient account.' }); return; }

    setStatus({ type: 'loading', msg: 'Initiating secure transfer…' });
    const payload: TransferRequest = {
      ...formData,
      idempotency_key: formData.idempotency_key.trim() ||
        `TF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    try {
      const res = await bankingService.executeTransfer(payload);
      setStatus({
        type: 'success',
        msg:  res.idempotent ? 'Transfer already processed — duplicate request safely ignored.' : res.message,
        txId: res.transaction_id,
        phase: res.phase,
      });
      setFormData(f => ({ ...f, amount: 0, idempotency_key: '' }));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setStatus({ type: 'error', msg: e.response?.data?.detail || e.message || 'Transfer failed.' });
    }
  };

  /* ── Side panel (source / target) ── */
  const renderSide = (side: 'source' | 'target') => {
    const isSrc      = side === 'source';
    const isLoading  = isSrc ? loadingSource : loadingTarget;
    const accounts   = isSrc ? sourceAccounts : targetAccounts;
    const idField    = isSrc ? 'source_account_id' : 'target_account_id';
    const branchVal  = isSrc ? formData.source_branch : formData.target_branch;
    const bm         = BRANCH_META[branchVal];
    const label      = isSrc ? '↑ Sending From' : '↓ Sending To';

    return (
      <div style={{ padding: 18, borderRadius: 14, background: bm.bg, border: `1px solid ${bm.border}` }}>
        <p style={{ margin: '0 0 14px', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: bm.color }}>
          {label}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="label">Branch</label>
            <select
              className="select"
              value={branchVal}
              onChange={e => {
                if (isSrc && preloadedSourceAccounts.length > 0) {
                  const branch = e.target.value as Branch;
                  const filtered = preloadedSourceAccounts.filter(a => a.branch === branch && a.status === 'ACTIVE');
                  setSourceAccounts(filtered);
                  setFormData(f => ({ ...f, source_branch: branch, source_account_id: '' }));
                } else {
                  fetchAccounts(e.target.value as Branch, side);
                }
              }}
            >
              {BRANCHES.map(b => (
                <option key={b} value={b}>{BRANCH_META[b].icon}  {BRANCH_META[b].label} Branch</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Account Holder</label>
            {isLoading ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--t-faint)', fontStyle: 'italic', padding: '10px 0' }}>
                Loading accounts…
              </p>
            ) : accounts.length > 0 ? (
              <select
                required
                className="select"
                value={formData[idField]}
                onChange={e => setFormData(f => ({ ...f, [idField]: e.target.value }))}
              >
                <option value="">Select account…</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.account_title} — ${a.available_balance.toFixed(2)}
                  </option>
                ))}
              </select>
            ) : (
              <p style={{ fontSize: '0.78rem', color: 'var(--t-faint)', fontStyle: 'italic', padding: '8px 0' }}>
                {isSrc ? 'Select a branch or sign in as a customer.' : 'Select a branch to load recipients.'}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* 2PC Phase tracker */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
        borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)',
      }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--t-faint)', marginRight: 4 }}>
          2PC PROTOCOL
        </span>
        {PHASES.map((phase, i) => (
          <div key={phase} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {i > 0 && <span style={{ color: 'var(--t-faint)', fontSize: '0.75rem' }}>→</span>}
            <span style={{
              padding: '3px 11px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 800,
              background: status.phase === phase ? 'rgba(52,211,153,0.15)'
                : (status.type === 'error' && phase === 'PREPARED') ? 'rgba(239,68,68,0.12)'
                : 'rgba(255,255,255,0.04)',
              color: status.phase === phase ? '#34d399'
                : (status.type === 'error' && phase === 'PREPARED') ? '#f87171'
                : 'var(--t-faint)',
              border: status.phase === phase ? '1px solid rgba(52,211,153,0.3)' : '1px solid transparent',
            }}>
              {phase}
            </span>
          </div>
        ))}
        {status.type === 'error' && (
          <span style={{
            padding: '3px 11px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 800,
            background: 'rgba(239,68,68,0.15)', color: '#f87171',
            border: '1px solid rgba(239,68,68,0.3)', marginLeft: 4,
          }}>ABORTED</span>
        )}
      </div>

      {/* Source / Target */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {renderSide('source')}
        {renderSide('target')}
      </div>

      {/* Amount + Reference */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label className="label">Transfer Amount ($)</label>
          <input
            required type="number" min="0.01" step="0.01"
            className="input input-mono"
            style={{ fontSize: '1.1rem', fontWeight: 700 }}
            value={formData.amount || ''}
            onChange={e => setFormData(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="label">
            Reference Key
            <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', opacity: 0.55 }}>(optional — auto-generated)</span>
          </label>
          <input
            type="text"
            className="input input-mono"
            value={formData.idempotency_key || ''}
            onChange={e => setFormData(f => ({ ...f, idempotency_key: e.target.value }))}
            placeholder="auto-generated"
            style={{ fontSize: '0.78rem' }}
          />
        </div>
      </div>

      <button type="submit" disabled={status.type === 'loading'} className="btn btn-gold" style={{ padding: '13px 24px' }}>
        {status.type === 'loading' ? '⏳ Processing Transfer…' : '⇄  Execute Secure Transfer'}
      </button>

      {status.type !== 'idle' && (
        <div className={`alert ${
          status.type === 'success' ? 'alert-success' :
          status.type === 'loading' ? 'alert-loading' : 'alert-error'
        }`}>
          <p style={{ margin: 0, fontWeight: 600 }}>{status.msg}</p>
          {status.txId && (
            <p className="mono" style={{ margin: '6px 0 0', fontSize: '0.72rem', opacity: 0.8 }}>
              TX ID: {status.txId}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
