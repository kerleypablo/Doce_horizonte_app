import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.tsx';
import { AppShell } from '../shared/AppShell.tsx';

export const ProtectedLayout = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
};
