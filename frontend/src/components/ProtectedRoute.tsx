import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: string[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div style={{ padding: 24 }}>Carregando...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && requiredRoles.length > 0 && user) {
    const hasRequiredRole = user.roles.some((role) => requiredRoles.includes(role));
    if (!hasRequiredRole) {
      return (
        <div style={{ padding: 24 }}>
          <h1>Acesso negado</h1>
          <p>Você não tem permissão para acessar esta página.</p>
        </div>
      );
    }
  }

  return <>{children}</>;
}
