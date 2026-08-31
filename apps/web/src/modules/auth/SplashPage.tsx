import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const SplashPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => navigate('/login', { replace: true }), 1600);
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <main className="splash-page" aria-label="Doce Gestão">
      <img className="splash-logo" src="/brand/dg-logo.png" alt="Doce Gestão — app de gerenciamento" />
    </main>
  );
};
