import { useAuth } from '../context/AuthContext';
import Sidebar          from '../components/Sidebar';
import NodeHealthPanel  from '../components/NodeHealthPanel';
import GlobalQueryPanel from '../components/GlobalQueryPanel';
import LedgerPanel      from '../components/LedgerPanel';
import AccountForm      from '../components/AccountForm';

export default function AdminDashboard() {
  const { adminSection } = useAuth();

  return (
    <div className="app-shell">
      <Sidebar mode="admin" />

      <main className="main-content">
        <div className="page-container">

          {/* Page header */}
          <div className="fade-in" style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                {adminSection === 'health'       ? 'Branch Network Status' :
                 adminSection === 'search'       ? 'Account Search'        :
                 adminSection === 'ledger'       ? 'Global Transaction Ledger' :
                                                   'Open New Account'}
              </h1>
              <span className={`badge ${
                adminSection === 'health'  ? 'badge-teal'    :
                adminSection === 'search'  ? 'badge-blue'    :
                adminSection === 'ledger'  ? 'badge-amber'   : 'badge-slate'
              }`}>
                {adminSection === 'health'  ? 'Live' :
                 adminSection === 'search'  ? 'Fan-out Query' :
                 adminSection === 'ledger'  ? '2PC Log' : 'Distributed Write'}
              </span>
            </div>
            <p className="section-sub">
              {adminSection === 'health'  ? 'Live connectivity check — each ping hits the respective MongoDB Atlas branch node.' :
               adminSection === 'search'  ? 'Fan-out query sent to all 5 branch nodes simultaneously. Results merged by the coordinator.' :
               adminSection === 'ledger'  ? 'All cross-branch transfers are logged here. Track 2PC state: PENDING → PREPARED → COMMITTED / ABORTED.' :
               'Provision a new bank account on any branch. Write is routed to that branch\'s dedicated database node.'}
            </p>
          </div>

          {/* ── Branch Network ── */}
          {adminSection === 'health' && (
            <div className="glass fade-in" style={{ padding: '24px 28px' }}>
              <NodeHealthPanel />
            </div>
          )}

          {/* ── Account Search ── */}
          {adminSection === 'search' && (
            <div className="glass fade-in" style={{ padding: '28px 32px' }}>
              <GlobalQueryPanel />
            </div>
          )}

          {/* ── Global Ledger ── */}
          {adminSection === 'ledger' && (
            <div className="glass fade-in" style={{ padding: '28px 32px' }}>
              <LedgerPanel limit={100} />
            </div>
          )}

          {/* ── Open Account ── */}
          {adminSection === 'open-account' && (
            <div className="glass fade-in" style={{ padding: '28px 32px', maxWidth: 560 }}>
              <AccountForm />
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
