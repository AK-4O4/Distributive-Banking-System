import { useState } from 'react';
import { bankingService, TransferRequest, AccountResponse, BRANCHES, Branch } from '../services/api';

export default function TransferForm() {
    const [formData, setFormData] = useState<TransferRequest>({
        initiator_id: 'admin_dashboard',
        source_branch: 'north',
        source_account_id: '',
        target_branch: 'south',
        target_account_id: '',
        amount: 0,
        idempotency_key: '',
    });
    const [status, setStatus] = useState<{
        type: 'idle' | 'loading' | 'success' | 'error';
        msg: string;
        txId?: string;
        phase?: string;
    }>({ type: 'idle', msg: '' });

    const [sourceAccounts, setSourceAccounts] = useState<AccountResponse[]>([]);
    const [targetAccounts, setTargetAccounts] = useState<AccountResponse[]>([]);
    const [loadingSource, setLoadingSource] = useState(false);
    const [loadingTarget, setLoadingTarget] = useState(false);

    const fetchAccounts = async (branch: Branch, side: 'source' | 'target') => {
        const setLoading = side === 'source' ? setLoadingSource : setLoadingTarget;
        const setAccounts = side === 'source' ? setSourceAccounts : setTargetAccounts;
        const field = side === 'source' ? 'source_account_id' : 'target_account_id';
        const branchField = side === 'source' ? 'source_branch' : 'target_branch';

        setLoading(true);
        setAccounts([]);
        setFormData(f => ({ ...f, [branchField]: branch, [field]: '' }));
        try {
            const accounts = await bankingService.listAccounts(branch, 'ACTIVE');
            setAccounts(accounts);
        } catch {
            setAccounts([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus({ type: 'loading', msg: 'Initiating Two-Phase Commit...' });

        const payload: TransferRequest = {
            ...formData,
            // SECURITY + CONSISTENCY: auto-generate idempotency key to prevent duplicate transfers
            idempotency_key: formData.idempotency_key || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };

        try {
            const res = await bankingService.executeTransfer(payload);
            setStatus({
                type: 'success',
                msg: res.idempotent ? 'Idempotent replay — transfer already committed.' : res.message,
                txId: res.transaction_id,
                phase: res.phase,
            });
            setFormData(f => ({ ...f, amount: 0, idempotency_key: '' }));
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } }; message?: string };
            setStatus({ type: 'error', msg: e.response?.data?.detail || e.message || 'Transfer aborted' });
        }
    };

    const renderSide = (side: 'source' | 'target') => {
        const isLoading = side === 'source' ? loadingSource : loadingTarget;
        const accounts = side === 'source' ? sourceAccounts : targetAccounts;
        const idField = side === 'source' ? 'source_account_id' : 'target_account_id';
        const branchVal = side === 'source' ? formData.source_branch : formData.target_branch;
        const label = side === 'source' ? 'Source Node (Sender)' : 'Target Node (Receiver)';
        const color = side === 'source'
            ? 'bg-blue-50/60 border-blue-100 text-blue-700'
            : 'bg-violet-50/60 border-violet-100 text-violet-700';
        const focusColor = side === 'source' ? 'focus:border-blue-400 focus:ring-blue-400' : 'focus:border-violet-400 focus:ring-violet-400';

        return (
            <div className={`p-4 rounded-xl border ${color.split(' ').slice(0, 2).join(' ')}`}>
                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${color.split(' ')[2]}`}>{label}</p>
                <div className="space-y-2">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Branch</label>
                        <select
                            value={branchVal}
                            onChange={e => fetchAccounts(e.target.value as Branch, side)}
                            className={`w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm outline-none focus:ring-1 ${focusColor}`}
                        >
                            {BRANCHES.map(b => (
                                <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Account</label>
                        {isLoading ? (
                            <p className="text-xs text-slate-400 py-2 italic">Loading accounts…</p>
                        ) : accounts.length > 0 ? (
                            <select
                                required
                                value={formData[idField]}
                                onChange={e => setFormData(f => ({ ...f, [idField]: e.target.value }))}
                                className={`w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm outline-none focus:ring-1 ${focusColor}`}
                            >
                                <option value="">Select account…</option>
                                {accounts.map(a => (
                                    <option key={a.id} value={a.id}>
                                        {a.customer_name} ({a.customer_id}) — ${a.available_balance.toFixed(2)}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <p className="text-xs text-slate-400 py-2 italic">Select a branch to load ACTIVE accounts</p>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* 2PC phase tracker */}
            <div className="flex items-center gap-1 text-xs">
                {(['PENDING', 'PREPARED', 'COMMITTED'] as const).map((phase, i) => (
                    <div key={phase} className="flex items-center gap-1">
                        {i > 0 && <span className="text-slate-300 mx-0.5">→</span>}
                        <span className={`px-2 py-0.5 rounded-full border font-semibold ${status.phase === phase ? 'bg-blue-100 text-blue-700 border-blue-300' :
                                status.type === 'error' && phase === 'PREPARED' ? 'bg-red-50 text-red-500 border-red-200' :
                                    'bg-slate-100 text-slate-400 border-transparent'
                            }`}>{phase}</span>
                    </div>
                ))}
                {status.type === 'error' && (
                    <span className="ml-1 px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-200 font-semibold">
                        ABORTED
                    </span>
                )}
            </div>

            {/* Source / Target selectors */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {renderSide('source')}
                {renderSide('target')}
            </div>

            {/* Amount + Idempotency key */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Amount ($)</label>
                    <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={formData.amount || ''}
                        onChange={e => setFormData(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-base font-mono focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                        placeholder="0.00"
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        Idempotency Key
                        <span className="ml-1 text-slate-400 normal-case font-normal">(optional)</span>
                    </label>
                    <input
                        type="text"
                        value={formData.idempotency_key || ''}
                        onChange={e => setFormData(f => ({ ...f, idempotency_key: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-mono focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                        placeholder="auto-generated if blank"
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={status.type === 'loading'}
                className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed tracking-wide"
            >
                {status.type === 'loading' ? 'Executing 2PC…' : 'Execute Cross-Branch Transfer'}
            </button>

            {status.type !== 'idle' && (
                <div className={`p-3 rounded-xl text-sm ${status.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        status.type === 'loading' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                            'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                    <p className="font-semibold">{status.msg}</p>
                    {status.txId && (
                        <p className="text-xs mt-1 font-mono break-all select-all">TX ID: {status.txId}</p>
                    )}
                </div>
            )}
        </form>
    );
}
