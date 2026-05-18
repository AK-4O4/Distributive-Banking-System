import { useState, useEffect, useCallback } from 'react';
import { bankingService, TransactionLogEntry } from '../services/api';

const STATE_COLORS: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    PREPARED: 'bg-blue-100 text-blue-700 border-blue-200',
    COMMITTED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    ABORTED: 'bg-red-100 text-red-700 border-red-200',
    COMMIT_FAILED: 'bg-orange-100 text-orange-800 border-orange-200',
};

export default function LedgerPanel() {
    const [txns, setTxns] = useState<TransactionLogEntry[]>([]);
    const [filter, setFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);

    const fetchTxns = useCallback(async () => {
        setLoading(true);
        try {
            const data = await bankingService.listTransactions(filter || undefined, 50);
            setTxns(data);
        } catch {
            // silently fail if backend is down
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchTxns();
    }, [fetchTxns]);

    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(fetchTxns, 3000);
        return () => clearInterval(id);
    }, [autoRefresh, fetchTxns]);

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <select
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-slate-400 outline-none"
                >
                    <option value="">All States</option>
                    <option value="PENDING">PENDING</option>
                    <option value="PREPARED">PREPARED</option>
                    <option value="COMMITTED">COMMITTED</option>
                    <option value="ABORTED">ABORTED</option>
                    <option value="COMMIT_FAILED">COMMIT_FAILED</option>
                </select>

                <button
                    onClick={fetchTxns}
                    disabled={loading}
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                    {loading ? '⟳' : '↻ Refresh'}
                </button>

                <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer ml-auto">
                    <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={e => setAutoRefresh(e.target.checked)}
                        className="rounded"
                    />
                    Auto (3s)
                </label>
            </div>

            {txns.length === 0 && !loading && (
                <p className="text-sm text-slate-400 text-center py-6">No transactions in ledger.</p>
            )}

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {txns.map(tx => (
                    <div key={tx.id} className="border border-slate-200 rounded-xl p-3 bg-white hover:bg-slate-50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold border ${STATE_COLORS[tx.state] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                    {tx.state}
                                </span>
                                <span className="text-xs text-slate-500 font-mono truncate">{tx.id}</span>
                            </div>
                            {tx.amount != null && (
                                <span className="shrink-0 text-sm font-bold text-slate-800 font-mono">
                                    ${tx.amount.toFixed(2)}
                                </span>
                            )}
                        </div>

                        {tx.source_branch && tx.target_branch && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                                <span className="px-1.5 py-0.5 bg-slate-100 rounded font-semibold">{tx.source_branch}</span>
                                <span>→</span>
                                <span className="px-1.5 py-0.5 bg-slate-100 rounded font-semibold">{tx.target_branch}</span>
                            </div>
                        )}

                        {tx.error && (
                            <p className="mt-1.5 text-xs text-red-600 bg-red-50 rounded px-2 py-1">{tx.error}</p>
                        )}

                        {tx.created_at && (
                            <p className="mt-1 text-xs text-slate-400">
                                {new Date(tx.created_at).toLocaleString()}
                                {tx.committed_at && ` → committed ${new Date(tx.committed_at).toLocaleString()}`}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
