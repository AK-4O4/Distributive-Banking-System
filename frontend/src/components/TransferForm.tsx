import { useState } from 'react';
import { bankingService, TransferRequest } from '../services/api';

export default function TransferForm() {
    const [formData, setFormData] = useState<TransferRequest>({
        initiator_id: 'admin_dashboard',
        source_branch: 'north',
        source_account_id: '',
        target_branch: 'south',
        target_account_id: '',
        amount: 0,
    });
    const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', msg: string, txId?: string }>({ type: 'idle', msg: '' });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus({ type: 'idle', msg: 'Executing Two-Phase Commit...' });
        try {
            const res = await bankingService.executeTransfer(formData);
            setStatus({ type: 'success', msg: res.message, txId: res.transaction_id });
            setFormData({ ...formData, amount: 0 });
        } catch (err: any) {
            setStatus({ type: 'error', msg: err.response?.data?.detail || err.message || 'Transfer aborted' });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="col-span-2 font-semibold text-slate-700 text-sm">Source (Sender)</div>
                <div>
                    <label className="block text-xs font-medium text-slate-500">Branch</label>
                    <select value={formData.source_branch} onChange={e => setFormData({ ...formData, source_branch: e.target.value as any })} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500 text-sm">
                        <option value="north">North Branch</option>
                        <option value="south">South Branch</option>
                        <option value="east">East Branch</option>
                        <option value="west">West Branch</option>
                        <option value="central">Central Branch</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500">Account ID (Mongo _id)</label>
                    <input required type="text" value={formData.source_account_id} onChange={e => setFormData({ ...formData, source_account_id: e.target.value })} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500 text-sm" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="col-span-2 font-semibold text-slate-700 text-sm">Target (Receiver)</div>
                <div>
                    <label className="block text-xs font-medium text-slate-500">Branch</label>
                    <select value={formData.target_branch} onChange={e => setFormData({ ...formData, target_branch: e.target.value as any })} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500 text-sm">
                        <option value="north">North Branch</option>
                        <option value="south">South Branch</option>
                        <option value="east">East Branch</option>
                        <option value="west">West Branch</option>
                        <option value="central">Central Branch</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500">Account ID (Mongo _id)</label>
                    <input required type="text" value={formData.target_account_id} onChange={e => setFormData({ ...formData, target_account_id: e.target.value })} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500 text-sm" />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700">Transfer Amount</label>
                <input required type="number" min="0.01" step="0.01" value={formData.amount} onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border text-lg focus:border-blue-500 focus:ring-blue-500" />
            </div>

            <button type="submit" className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                Execute Cross-Branch Transfer
            </button>

            {status.type !== 'idle' && (
                <div className={`mt-4 p-3 rounded text-sm ${status.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    <p className="font-semibold">{status.msg}</p>
                    {status.txId && <p className="text-xs mt-1 font-mono">Global TX Ledger ID: {status.txId}</p>}
                </div>
            )}
        </form>
    );
}