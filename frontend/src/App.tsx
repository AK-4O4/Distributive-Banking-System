import { useAuth }         from './context/AuthContext';
import LoginPage           from './pages/LoginPage';
import CustomerDashboard   from './pages/CustomerDashboard';
import AdminDashboard      from './pages/AdminDashboard';

export default function App() {
  const { view } = useAuth();

  if (view === 'login')    return <LoginPage />;
  if (view === 'admin')    return <AdminDashboard />;
  return <CustomerDashboard />;
}
