import { useState, useEffect } from 'react';
import { bankingService, type AccountResponse } from '../services/api';
import { useAuth }      from '../context/AuthContext';
import Sidebar          from '../components/Sidebar';
import AccountCard      from '../components/AccountCard';
import TransferForm     from '../components/TransferForm';
import LedgerPanel      from '../components/LedgerPanel';
import AccountForm      from '../components/AccountForm';

export default function CustomerDashboard() {
  const { customerId, customerName, customerAccounts, customerSection,
          setCustomerSection, refreshCustomerAccounts } = useAuth();

  const [accounts, setAccounts] = useState<AccountResponse[]>(customerAccounts);
  const [totalBalance, setTotalBalance] = useState(0);

  useEffect(() => {
    setAccounts(customerAccounts);
    setTotalBalance(customerAccounts.reduce((s, a) => s + a.available_balance, 0));
  }, [customerAccounts]);

  const handleAccountUpdated = (updated: AccountResponse) => {
    const next = accounts.map(a => a.id === updated.id ? updated : a);
    setAccounts(next);
    refreshCustomerAccounts(next);
    setTotalBalance(next.reduce((s, a) => s + a.available_balance, 0));
  };

  /* greeting */
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="app-shell">
      <Sidebar mode="customer" />

      <main className="main-content">
        <div className="page-container">

          {/* ── Dashboard ── */}
          {customerSection === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Greeting */}
              <div className="fade-in">
                <p style={{ margin: '0 0 4px', fontSize: '0.8rem', color: 'var(--t-muted)' }}>
                  {greeting},
                </p>
                <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                  {customerName} 👋
                </h1>
              </div>

              {/* Total Balance */}
              <div className="total-balance-card fade-in stagger-1">
                <p className="label" style={{ marginBottom: 8 }}>Total Balance — All Branches</p>
                <p className="mono" style={{ margin: 0, fontSize: '2.6rem', fontWeight: 900, color: 'var(--c-gold-300)', letterSpacing: '-0.03em' }}>
                  ${totalBalance.toFixed(2)}
                </p>
                <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--t-muted)' }}>
                  Across {accounts.length} account{accounts.length !== 1 ? 's' : ''} · Customer ID:&nbsp;
                  <span className="mono" style={{ color: 'var(--c-gold-400)' }}>{customerId}</span>
                </p>

                {/* Quick actions */}
                <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                  <button className="btn btn-gold" style={{ width: 'auto', padding: '10px 22px', fontSize: '0.82rem' }}
                    onClick={() => setCustomerSection('transfer')}>
                    ⇄ Transfer Funds
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '10px 18px', fontSize: '0.82rem' }}
                    onClick={() => setCustomerSection('history')}>
                    📋 History
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '10px 18px', fontSize: '0.82rem' }}
                    onClick={() => setCustomerSection('open-account')}>
                    ＋ New Account
                  </button>
                </div>
              </div>

              {/* Account Cards */}
              {accounts.length > 0 && (
                <div>
                  <p className="label" style={{ marginBottom: 14 }}>Your Accounts</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
                    {accounts.map((a, i) => (
                      <AccountCard
                        key={a.id}
                        account={a}
                        onUpdated={handleAccountUpdated}
                        animClass={`fade-in stagger-${Math.min(i + 1, 4)}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Transactions */}
              <div className="glass fade-in" style={{ padding: '22px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: 'var(--t-primary)' }}>Recent Transactions</p>
                  <button className="btn btn-ghost" onClick={() => setCustomerSection('history')} style={{ fontSize: '0.78rem' }}>
                    View All →
                  </button>
                </div>
                <LedgerPanel limit={5} />
              </div>
            </div>
          )}

          {/* ── Transfer ── */}
          {customerSection === 'transfer' && (
            <div className="glass fade-in" style={{ padding: '28px 32px' }}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                  <h2 className="section-title">Fund Transfer</h2>
                  <span className="badge badge-gold">Two-Phase Commit</span>
                </div>
                <p className="section-sub">
                  Transfers between any two branches are guaranteed to be atomic — either fully
                  completed or fully rolled back using the Two-Phase Commit protocol.
                </p>
              </div>
              <TransferForm preloadedSourceAccounts={accounts} />
            </div>
          )}

          {/* ── History ── */}
          {customerSection === 'history' && (
            <div className="glass fade-in" style={{ padding: '28px 32px' }}>
              <div style={{ marginBottom: 24 }}>
                <h2 className="section-title" style={{ marginBottom: 6 }}>Transaction History</h2>
                <p className="section-sub">
                  All cross-branch transfers are logged in the coordinator ledger with full
                  2PC state tracking: PENDING → PREPARED → COMMITTED (or ABORTED).
                </p>
              </div>
              <LedgerPanel limit={50} />
            </div>
          )}

          {/* ── Open Account ── */}
          {customerSection === 'open-account' && (
            <div className="glass fade-in" style={{ padding: '28px 32px' }}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                  <h2 className="section-title">Open a New Account</h2>
                  <span className="badge badge-slate">Distributed Write</span>
                </div>
                <p className="section-sub">
                  Open an account at any branch. Your data is written to that branch's
                  dedicated database node and immediately available across the network.
                </p>
              </div>
              <div style={{ maxWidth: 520 }}>
                <AccountForm prefillCustomerId={customerId ?? ''} prefillCustomerName={customerName ?? ''} />
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
