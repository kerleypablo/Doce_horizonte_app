import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../shared/supabase.ts';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from './AuthContext.tsx';
import { safeMcpReviewPath } from './safe-return.ts';

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
        const me = await apiFetch<{ role: 'master' | 'admin' | 'common'; modules: string[] }>('/auth/me', { token });
        const profile = data.session?.user
          ? {
              email: data.session.user.email ?? undefined,
              name: (data.session.user.user_metadata?.full_name as string | undefined) ?? undefined,
              avatarUrl: (data.session.user.user_metadata?.avatar_url as string | undefined) ?? undefined
            }
          : undefined;
        login(token, me.role, me.modules ?? [], profile, data.session?.refresh_token);
        const consent = sessionStorage.getItem('oauth_consent_id');
        sessionStorage.removeItem('oauth_consent_id');
        const reviewPath = safeMcpReviewPath(sessionStorage.getItem('mcp_review_return'));
        sessionStorage.removeItem('mcp_review_return');
        navigate(consent ? '/oauth/consent?authorization_id=' + encodeURIComponent(consent) : reviewPath ?? '/app');
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        const shouldOnboard =
          message.includes('Usuario sem empresa vinculada') ||
          message.includes('"statusCode":403');

        if (shouldOnboard) {
          sessionStorage.setItem('pending_token', token);
          navigate('/onboarding');
          return;
        }

        setError('Nao foi possivel validar o usuario na API. Tente novamente em instantes.');
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
