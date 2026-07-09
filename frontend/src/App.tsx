import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { ClinicSelector } from './components/ClinicSelector';
import { PendingOperationsIndicator } from './components/PendingOperationsIndicator';
import { OfflineBanner } from './components/OfflineBanner';
import { ProtectedRoute } from './components/ProtectedRoute';
import {
  LoginPage,
  DashboardPage,
  ShiftsPage,
  AttendancePage,
  ClinicsPage,
  UsersPage,
  DoctorPage,
} from './pages';

function AppLayout() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const roles = user?.roles ?? [];
  const isAdminGlobal = roles.includes('AdminGlobal');
  const isAdminClinica = roles.includes('AdminClinica');
  const isMedico = roles.includes('Medico');
  const isProfessional =
    roles.includes('Medico') || roles.includes('Enfermeiro') || roles.includes('Tecnico');

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 24px',
        borderBottom: '1px solid #ddd',
        flexWrap: 'wrap',
      }}
    >
      <strong style={{ marginRight: 8 }}>PlantonHub</strong>
      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/shifts">Plantões</Link>
        {isProfessional && <Link to="/attendance">Presença</Link>}
        {isMedico && <Link to="/doctor">Médico</Link>}
        {(isAdminGlobal || isAdminClinica) && <Link to="/clinics">Clínicas</Link>}
        {isAdminGlobal && <Link to="/users">Usuários</Link>}
      </nav>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <PendingOperationsIndicator />
        <ClinicSelector />
        <span style={{ fontSize: 14 }}>{user?.email}</span>
        <button
          type="button"
          onClick={handleLogout}
          style={{ padding: '4px 12px', cursor: 'pointer' }}
        >
          Sair
        </button>
      </div>
    </header>
  );
}

function App() {
  return (
    <>
      <OfflineBanner />
      <AppLayout />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shifts"
          element={
            <ProtectedRoute>
              <ShiftsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/attendance"
          element={
            <ProtectedRoute requiredRoles={['Medico', 'Enfermeiro', 'Tecnico']}>
              <AttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clinics"
          element={
            <ProtectedRoute requiredRoles={['AdminGlobal', 'AdminClinica']}>
              <ClinicsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute requiredRoles={['AdminGlobal']}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor"
          element={
            <ProtectedRoute requiredRoles={['Medico']}>
              <DoctorPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export default App;
