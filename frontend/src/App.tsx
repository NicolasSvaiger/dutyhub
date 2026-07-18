import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './hooks/useAuth';
import { BRAND } from './config/brand';
import { PROFESSIONAL_ROLES, isProfessional } from './config/roles';
import { ClinicSelector } from './components/ClinicSelector';
import { PendingOperationsIndicator } from './components/PendingOperationsIndicator';
import { OfflineBanner } from './components/OfflineBanner';
import { ProtectedRoute } from './components/ProtectedRoute';
import {
  LoginPage,
  ForgotPasswordPage,
  DashboardPage,
  ShiftsPage,
  AttendancePage,
  ClinicsPage,
  UsersPage,
  DoctorPage,
} from './pages';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminPage } from './pages/admin/AdminPage';
import { PrefeituraLoginPage } from './pages/prefeitura/PrefeituraLoginPage';
import { PrefeituraPage } from './pages/prefeitura/PrefeituraPage';
import { PrefeituraTvMode } from './pages/prefeitura/PrefeituraTvMode';

function AppLayout() {
  const { user, isAuthenticated, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const roles = user?.roles ?? [];
  const isAdminGlobal = roles.includes('AdminGlobal');
  const isAdminClinica = roles.includes('AdminClinica');
  const professional = isProfessional(roles);

  // Hide header on admin/prefeitura pages (they have their own sidebar) and login pages
  const path = window.location.pathname;
  if (
    path.startsWith('/admin') ||
    path.startsWith('/prefeitura') ||
    path === '/login' ||
    path === '/forgot-password'
  ) {
    return null;
  }

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
      <strong style={{ marginRight: 8 }}>{BRAND.name}</strong>
      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/shifts">Plantões</Link>
        {professional && <Link to="/attendance">Presença</Link>}
        {professional && <Link to="/doctor">{t('doctor.nav.professionalArea')}</Link>}
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
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
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
            <ProtectedRoute requiredRoles={[...PROFESSIONAL_ROLES]}>
              <DoctorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRoles={['AdminGlobal', 'AdminClinica']}>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route path="/prefeitura/login" element={<PrefeituraLoginPage />} />
        <Route
          path="/prefeitura"
          element={
            <ProtectedRoute requiredRoles={['GestorPublico']}>
              <PrefeituraPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/prefeitura/tv"
          element={
            <ProtectedRoute requiredRoles={['GestorPublico']}>
              <PrefeituraTvMode />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export default App;
