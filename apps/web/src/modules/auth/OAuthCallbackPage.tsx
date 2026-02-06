import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../shared/supabase.ts';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from './AuthContext.tsx';

export const OAuthCallbackPage = () => {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setError('Nao foi possivel autenticar.');
        return;
      }

      try {
        const me = await apiFetch<{ role: 'admin' | 'common' }>('/auth/me', { token });
        login(token, me.role);
        navigate('/app');
      } catch (err) {
        sessionStorage.setItem('pending_token', token);
        navigate('/onboarding');
      }
    };

    run();
  }, [login, navigate]);

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Conectando...</h1>
        <p>Finalizando autenticacao.</p>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
};
