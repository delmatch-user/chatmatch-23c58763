import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// Routes that supervisors can access inside the admin panel
const SUPERVISOR_ALLOWED_ADMIN_ROUTES = ['/admin/robos'];

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, isLoading, isAdmin, isSupervisor, isFranqueado } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Franqueados can only access /franqueado
  if (isFranqueado && !location.pathname.startsWith('/franqueado')) {
    return <Navigate to="/franqueado" replace />;
  }

  if (requireAdmin && !isAdmin) {
    // Allow supervisors on specific admin routes
    const isSupervisorAllowed = isSupervisor && SUPERVISOR_ALLOWED_ADMIN_ROUTES.some(
      route => location.pathname.startsWith(route)
    );
    if (!isSupervisorAllowed) {
      return <Navigate to="/fila" replace />;
    }
  }

  return <>{children}</>;
}
