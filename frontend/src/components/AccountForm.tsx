import { useState } from 'react';
import { bankingService, AccountCreate } from '../services/api';

export default function AccountForm() {
    const [formData, setFormData] = useState<AccountCreate>({
        customer_id: '',
        customer_name: '',
        branch_id: 'north',
        initial_balance: 0,
    });
    const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', msg: string }>({ type: 'idle', msg: '' });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await bankingService.createAccount(formData);
            setStatus({ type: 'success', msg: `Account created! ID: ${res.id}` });
            setFormData({ ...formData, customer_name: '', initial_balance: 0 });
        } catch (err: any) {
            setStatus({ type: 'error', msg: err.response?.data?.detail || err.message || 'Failed to create account' });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700">Global Customer ID</label>
                <input required type="text" value={formData.customer_id} onChange={e => setFormData({ ...formData, customer_id: e.target.value })} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500" placeholder="CUST-001" />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700">Customer Name</label>
                <input required type="text" value={formData.customer_name} onChange={e => setFormData({ ...formData, customer_name: e.target.value })} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500" placeholder="John Doe" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700">Target Node (Branch)</label>
                    <select value={formData.branch_id} onChange={e => setFormData({ ...formData, branch_id: e.target.value as any })} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500">
                        <option value="north">North Branch</option>
                        <option value="south">South Branch</option>
                        <option value="east">East Branch</option>
                        <option value="west">West Branch</option>
                        <option value="central">Central Branch</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">Initial Deposit</label>
                    <input required type="number" min="0" value={formData.initial_balance} onChange={e => setFormData({ ...formData, initial_balance: parseFloat(e.target.value) })} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500" />
                </div>
            </div>
            <button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500">
                Provision Account
            </button>

            {status.type !== 'idle' && (
                <div className={`mt-4 p-3 rounded text-sm ${status.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {status.msg}
                </div>
            )}
        </form>
    );
}