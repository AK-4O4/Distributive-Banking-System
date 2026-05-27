import { useState, useEffect, useCallback } from 'react';
import { bankingService } from '../services/api';

interface HealthData {
  branches: Record<string, string>;
  timestamp: string;
}

const BRANCHES_META = [
  { key: 'NORTH',   icon: '🏔', color: '#38bdf8' },
  { key: 'SOUTH',   icon: '🌴', color: '#fbbf24' },
  { key: 'EAST',    icon: '🌅', color: '#34d399' },
  { key: 'WEST',    icon: '🌄', color: '#a78bfa' },
  { key: 'CENTRAL', icon: '🏛', color: '#d4a843' },
];

interface NodeHealthPanelProps {
  compact?: boolean; // sidebar compact mode
}

export default function NodeHealthPanel({ compact = false }: NodeHealthPanelProps) {
  const [health, setHealth]   = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await bankingService.checkDetailedHealth();
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /* ── Compact (sidebar) view ── */
  if (compact) {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {BRANCHES_META.map(b => {
          const status = health?.branches?.[b.key];
          const isOk   = status === 'ok';
          return (
            <div
              key={b.key}
              title={`${b.key.charAt(0).toUpperCase() + b.key.slice(1)}: ${isOk ? 'Online' : status ?? 'Unknown'}`}
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: status === undefined ? 'rgba(148,163,184,0.3)' : isOk ? b.color : '#f87171',
                boxShadow: isOk ? `0 0 6px ${b.color}66` : 'none',
              }}
              className={isOk ? 'pulse-dot' : ''}
            />
          );
        })}
      </div>
    );
  }

  /* ── Full view ── */
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--t-muted)' }}>
          Live connectivity — pings each MongoDB Atlas branch node.
        </p>
        <button onClick={refresh} disabled={loading} className="btn btn-ghost">
          {loading ? '⟳' : '↻ Ping All'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
        {BRANCHES_META.map(b => {
          const status    = health?.branches?.[b.key];
          const isOk      = status === 'ok';
          const isUnknown = status === undefined;
          return (
            <div key={b.key} style={{
              padding: '16px 10px',
              borderRadius: 14,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
              background: isOk ? `${b.color}0f` : isUnknown ? 'rgba(255,255,255,0.03)' : 'rgba(239,68,68,0.07)',
              border: `1px solid ${isOk ? b.color + '33' : isUnknown ? 'rgba(255,255,255,0.05)' : 'rgba(239,68,68,0.2)'}`,
              transition: 'all 0.3s',
            }}>
              <span style={{ fontSize: '1.2rem' }}>{b.icon}</span>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: isOk ? b.color : isUnknown ? 'rgba(148,163,184,0.3)' : '#f87171',
                boxShadow: isOk ? `0 0 10px ${b.color}66` : 'none',
              }} className={isOk ? 'pulse-dot' : ''} />
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: isOk ? 'var(--t-primary)' : 'var(--t-muted)', textAlign: 'center' }}>
                {b.key.charAt(0) + b.key.slice(1).toLowerCase()}
              </span>
              <span className="mono" style={{ fontSize: '0.65rem', color: isOk ? b.color : isUnknown ? 'var(--t-faint)' : '#f87171' }}>
                {isUnknown ? '—' : isOk ? 'ONLINE' : 'ERROR'}
              </span>
            </div>
          );
        })}
      </div>

      {health?.timestamp && (
        <p style={{ marginTop: 10, fontSize: '0.68rem', color: 'var(--t-faint)', textAlign: 'right' }}>
          Last checked: {new Date(health.timestamp).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
