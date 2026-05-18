import { useState } from 'react';
import { bankingService, AccountCreate, BRANCHES } from '../services/api';

export default function AccountForm() {
    const [formData, setFormData] = useState<AccountCreate>({
        customer_id: '',
        customer_name: '',
        branch_id: 'north',
        initial_balance: 0,
    });
    const [status, setStatus] = useState<{
        type: 'idle' | 'loading' | 'success' | 'error';
        msg: string;
        accountId?: string;
    }>({ type: 'idle', msg: '' });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus({ type: 'loading', msg: 'Provisioning account...' });
        try {
            const res = await bankingService.createAccount(formData);
            setStatus({
                type: 'success',
                msg: `Account provisioned for ${res.customer_name} on ${res.branch_id} node`,
                accountId: res.id,
            });
            setFormData(f => ({ ...f, customer_name: '', customer_id: '', initial_balance: 0 }));
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } }; message?: string };
            setStatus({ type: 'error', msg: e.response?.data?.detail || e.message || 'Failed' });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        Customer ID
                    </label>
                    <input
                        required
                        type="text"
                        value={formData.customer_id}
                        onChange={e => setFormData(f => ({ ...f, customer_id: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm font-mono focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none"
                        placeholder="CUST-001"
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        Customer Name
                    </label>
                    <input
                        required
                        type="text"
                        value={formData.customer_name}
                        onChange={e => setFormData(f => ({ ...f, customer_name: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none"
                        placeholder="Jane Doe"
                    />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        Target Node
                    </label>
                    <select
                        value={formData.branch_id}
                        onChange={e => setFormData(f => ({ ...f, branch_id: e.target.value as AccountCreate['branch_id'] }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none"
                    >
                        {BRANCHES.map(b => (
                            <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        Initial Deposit ($)
                    </label>
                    <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.initial_balance}
                        onChange={e => setFormData(f => ({ ...f, initial_balance: parseFloat(e.target.value) || 0 }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none"
                    />
                </div>
            </div>
            <button
                type="submit"
                disabled={status.type === 'loading'}
                className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {status.type === 'loading' ? 'Provisioning...' : 'Provision Account'}
            </button>

            {status.type !== 'idle' && (
                <div className={`p-3 rounded-lg text-sm ${status.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        status.type === 'loading' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                            'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                    <p>{status.msg}</p>
                    {status.accountId && (
                        <div className="mt-2">
                            <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Account ID</p>
                            <p className="font-mono text-xs bg-white border border-emerald-200 rounded px-2 py-1 mt-1 break-all select-all">
                                {status.accountId}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </form>
    );
}
