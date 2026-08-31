import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.tsx';

export const SplashPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const timer = window.setTimeout(() => navigate(user ? '/app' : '/login', { replace: true }), 1600);
    return () => window.clearTimeout(timer);
  }, [navigate, user]);

  return (
    <main className="splash-page" aria-label="Doce Gestão">
      <img className="splash-logo" src="/brand/dg-logo.png" alt="Doce Gestão — app de gerenciamento" />
    </main>
  );
};
