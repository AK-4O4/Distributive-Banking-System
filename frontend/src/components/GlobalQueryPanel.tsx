import { useState } from 'react';
import { bankingService, AccountResponse } from '../services/api';

interface QueryResult {
    total_results: number;
    branches_queried: string[];
    branch_errors: Record<string, string>;
    accounts: AccountResponse[];
    query_filter: Record<string, unknown>;
}

export default function GlobalQueryPanel() {
    const [customerId, setCustomerId] = useState('');
    const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'FROZEN' | ''>('');
    const [minBalance, setMinBalance] = useState('');
    const [result, setResult] = useState<QueryResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [elapsed, setElapsed] = useState<number | null>(null);

    const runQuery = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setResult(null);
        const t0 = performance.now();

        try {
            const res = await bankingService.globalQuery({
                customer_id: customerId || undefined,
                status: status || undefined,
                min_balance: minBalance ? parseFloat(minBalance) : undefined,
            });
            setResult(res);
            setElapsed(performance.now() - t0);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } }; message?: string };
            setError(e.response?.data?.detail || e.message || 'Query failed');
        } finally {
            setLoading(false);
        }
    };

    const branchColor: Record<string, string> = {
        north: 'bg-sky-100 text-sky-700 border-sky-200',
        south: 'bg-amber-100 text-amber-700 border-amber-200',
        east: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        west: 'bg-violet-100 text-violet-700 border-violet-200',
        central: 'bg-rose-100 text-rose-700 border-rose-200',
    };

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                <p className="text-xs text-slate-500">
                    Fans out to all 5 nodes in parallel via <code className="bg-slate-100 px-1 rounded">asyncio.gather</code>.
                    Results are merged by the coordinator.
                </p>
            </div>

            <form onSubmit={runQuery} className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                            Customer ID
                        </label>
                        <input
                            type="text"
                            value={customerId}
                            onChange={e => setCustomerId(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm font-mono focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none"
                            placeholder="CUST-001"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                            Status Filter
                        </label>
                        <select
                            value={status}
                            onChange={e => setStatus(e.target.value as typeof status)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none"
                        >
                            <option value="">Any</option>
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="INACTIVE">INACTIVE</option>
                            <option value="FROZEN">FROZEN</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                            Min Balance ($)
                        </label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={minBalance}
                            onChange={e => setMinBalance(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none"
                            placeholder="0.00"
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-lg bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                    {loading ? 'Querying all nodes...' : 'Run Distributed Query'}
                </button>
            </form>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}

            {result && (
                <div className="space-y-3">
                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm">
                        <span className="font-bold text-slate-800">{result.total_results} results</span>
                        {elapsed !== null && (
                            <span className="text-slate-400">in {elapsed.toFixed(0)}ms (parallel fan-out)</span>
                        )}
                        {Object.keys(result.branch_errors).length > 0 && (
                            <span className="text-red-500 text-xs">
                                ⚠ Errors: {Object.keys(result.branch_errors).join(', ')}
                            </span>
                        )}
                    </div>

                    {/* Applied filter */}
                    {Object.keys(result.query_filter).length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                            {Object.entries(result.query_filter).map(([k, v]) => (
                                <span key={k} className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5">
                                    {k}: {String(v)}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Results table */}
                    {result.accounts.length > 0 ? (
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Node</th>
                                        <th className="px-3 py-2 text-left">Customer</th>
                                        <th className="px-3 py-2 text-right">Available</th>
                                        <th className="px-3 py-2 text-right">Locked</th>
                                        <th className="px-3 py-2 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {result.accounts.map(a => (
                                        <tr key={a.id} className="hover:bg-slate-50">
                                            <td className="px-3 py-2">
                                                <span className={`px-1.5 py-0.5 rounded text-xs border font-semibold ${branchColor[a.branch_id] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                    {a.branch_id}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">
                                                <p className="font-medium text-slate-800">{a.customer_name}</p>
                                                <p className="text-slate-400 font-mono">{a.customer_id}</p>
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-emerald-700">
                                                ${a.available_balance.toFixed(2)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-amber-600">
                                                {a.locked_balance > 0 ? `$${a.locked_balance.toFixed(2)}` : '—'}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${a.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                                                    a.status === 'FROZEN' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-slate-100 text-slate-500'
                                                    }`}>{a.status}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400 text-center py-4">No accounts match the query.</p>
                    )}
                </div>
            )}
        </div>
    );
}
