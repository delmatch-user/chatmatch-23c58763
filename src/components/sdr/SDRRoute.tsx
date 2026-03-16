import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/contexts/AppContext';

interface SDRRouteProps {
  children: ReactNode;
}

export function SDRRoute({ children }: SDRRouteProps) {
  const { user: authUser, isLoading, isAdmin } = useAuth();
  const { user, departments } = useApp();

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

  if (!authUser) {
    return <Navigate to="/login" replace />;
  }

  // Admin always has access
  if (isAdmin) {
    return <>{children}</>;
  }

  // Check if user belongs to "Comercial" department
  const comercialDept = departments.find(d => d.name.toLowerCase() === 'comercial');
  const hasAccess = comercialDept && user?.departments?.includes(comercialDept.id);

  if (!hasAccess) {
    return <Navigate to="/fila" replace />;
  }

  return <>{children}</>;
}
