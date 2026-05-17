import { useState, useEffect } from 'react';
import { bankingService } from './services/api';
import AccountForm from './components/AccountForm';
import TransferForm from './components/TransferForm';

function App() {
  const [serverStatus, setServerStatus] = useState<string>('Checking connection...');

  useEffect(() => {
    bankingService.checkHealth()
      .then(data => setServerStatus("🟢 Engine Connected: " + data.message))
      .catch(() => setServerStatus("🔴 Engine Offline: Ensure FastAPI is running on port 8000."));
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <header className="max-w-6xl mx-auto mb-10">
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
          Distributive Banking Hub
        </h1>
        <p className="text-slate-500 mt-2 text-lg">
          Cross-Node Transaction Coordinator & Ledger
        </p>
        <div className="mt-4 inline-flex items-center px-4 py-2 rounded-full bg-white shadow-sm border border-slate-200 text-sm font-medium text-slate-700">
          {serverStatus}
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-slate-800">Node Management</h2>
            <p className="text-sm text-slate-500">Provision new accounts across horizontally fragmented clusters.</p>
          </div>
          <AccountForm />
        </section>

        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-slate-800">Global Transfer (2PC)</h2>
            <p className="text-sm text-slate-500">Execute atomic transactions enforcing strict network consistency laws.</p>
          </div>
          <TransferForm />
        </section>
      </main>
    </div>
  );
}

export default App;