import { useState, useEffect } from 'react';
import { bankingService, setApiKey } from './services/api';
import AccountForm from './components/AccountForm';
import TransferForm from './components/TransferForm';
import GlobalQueryPanel from './components/GlobalQueryPanel';
import LedgerPanel from './components/LedgerPanel';
import NodeHealthPanel from './components/NodeHealthPanel';

type Tab = 'accounts' | 'transfer' | 'query' | 'ledger';

const TABS: { id: Tab; label: string; badge?: string }[] = [
  { id: 'accounts', label: 'Node Management' },
  { id: 'transfer', label: '2PC Transfer', badge: '2PC' },
  { id: 'query', label: 'Distributed Query', badge: 'Fan-out' },
  { id: 'ledger', label: 'TX Ledger' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('accounts');
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [apiKey, setApiKeyLocal] = useState('dev-secret-key-change-in-production');
  const [showKeyInput, setShowKeyInput] = useState(false);

  useEffect(() => {
    bankingService.checkHealth()
      .then(() => setServerStatus('online'))
      .catch(() => setServerStatus('offline'));
  }, []);

  const applyKey = () => {
    setApiKey(apiKey);
    setShowKeyInput(false);
    // Re-check health with new key
    setServerStatus('checking');
    bankingService.checkHealth()
      .then(() => setServerStatus('online'))
      .catch(() => setServerStatus('offline'));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Distributive Banking System
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Horizontal Fragmentation · 2PC · Fan-out Queries · Query Optimization
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* SECURITY: API Key control */}
            <div className="flex items-center gap-2">
              {showKeyInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKeyLocal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyKey()}
                    className="border border-slate-300 rounded px-2 py-1 text-xs font-mono w-52 focus:outline-none focus:border-blue-400"
                    placeholder="API key"
                  />
                  <button
                    onClick={applyKey}
                    className="text-xs bg-slate-800 text-white px-2 py-1 rounded hover:bg-slate-700"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => setShowKeyInput(false)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowKeyInput(true)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50"
                  title="Set API Key (X-API-Key header)"
                >
                  🔑 API Key
                </button>
              )}
            </div>

            {/* Connection status */}
            <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${serverStatus === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                serverStatus === 'offline' ? 'bg-red-50 text-red-700 border-red-200' :
                  'bg-slate-50 text-slate-500 border-slate-200'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${serverStatus === 'online' ? 'bg-emerald-500' :
                  serverStatus === 'offline' ? 'bg-red-500' : 'bg-slate-400'
                }`} />
              {serverStatus === 'online' ? 'Coordinator Online' :
                serverStatus === 'offline' ? 'Coordinator Offline' : 'Checking...'}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-0 border-t border-slate-100">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
              >
                {tab.label}
                {tab.badge && (
                  <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Node Health — always visible */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
            Node Connectivity
          </h2>
          <NodeHealthPanel />
        </section>

        {/* Main content tabs */}
        {activeTab === 'accounts' && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-slate-800">Node Management</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Provision accounts across horizontally fragmented cluster nodes.
                Each branch routes to its own physical MongoDB Atlas cluster.
              </p>
            </div>
            <div className="max-w-lg">
              <AccountForm />
            </div>
          </section>
        )}

        {activeTab === 'transfer' && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-800">Cross-Branch Transfer</h2>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">Two-Phase Commit</span>
              </div>
              <div className="mt-2 text-sm text-slate-500 space-y-0.5">
                <p>Phase 1 (PREPARE): Validates + locks funds at source node atomically.</p>
                <p>Phase 2 (COMMIT): Credits target and releases lock, or ABORTs with compensation.</p>
                <p>Idempotency keys prevent duplicate execution of the same transfer.</p>
              </div>
            </div>
            <div className="max-w-2xl">
              <TransferForm />
            </div>
          </section>
        )}

        {activeTab === 'query' && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-800">Distributed Query</h2>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">Fan-out</span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                Query is sent to all 5 nodes simultaneously using <code className="bg-slate-100 px-1 rounded text-xs">asyncio.gather</code>.
                Each node applies filters using its local indexes. Results are merged at the coordinator.
                Query optimization: projection + compound indexes on each shard.
              </p>
            </div>
            <GlobalQueryPanel />
          </section>
        )}

        {activeTab === 'ledger' && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-slate-800">Global Transaction Ledger</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                All 2PC transactions are recorded here: PENDING → PREPARED → COMMITTED (or ABORTED).
                On startup, the coordinator auto-recovers any transactions stuck in PREPARED state.
              </p>
            </div>
            <LedgerPanel />
          </section>
        )}
      </main>

      {/* Footer — features summary */}
      <footer className="max-w-7xl mx-auto px-6 py-6 mt-4">
        <div className="grid grid-cols-3 gap-4 text-xs text-slate-500">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="font-bold text-slate-700 mb-1">Security</p>
            <ul className="space-y-0.5">
              <li>· X-API-Key authentication on all endpoints</li>
              <li>· Rate limiting: 60 req/min per IP</li>
              <li>· Input sanitization (regex validators)</li>
              <li>· CORS restricted to known origin</li>
            </ul>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="font-bold text-slate-700 mb-1">Consistency</p>
            <ul className="space-y-0.5">
              <li>· Unique (customer_id, branch) constraint</li>
              <li>· ACTIVE status check before transfers</li>
              <li>· Atomic balance lock (no negative balance)</li>
              <li>· Idempotency key deduplication</li>
            </ul>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="font-bold text-slate-700 mb-1">Query Optimization</p>
            <ul className="space-y-0.5">
              <li>· Indexes created on startup (background)</li>
              <li>· Projections on all reads (no over-fetch)</li>
              <li>· Compound indexes for covered queries</li>
              <li>· Crash recovery via ledger on startup</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
