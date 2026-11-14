import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from './AuthContext.tsx';
import { GoogleButton } from './GoogleButton.tsx';
import { safeMcpReviewPath } from './safe-return.ts';

export const LoginPage = () => {
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<{ token: string; refreshToken?: string; role: 'master' | 'admin' | 'common'; modules: string[] }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password })
        }
      );
      login(data.token, data.role, data.modules ?? [], undefined, data.refreshToken);
      const consent = new URLSearchParams(window.location.search).get('consent');
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '';
      const reviewPath = safeMcpReviewPath(from) ?? '/app';
      navigate(consent ? '/oauth/consent?authorization_id=' + encodeURIComponent(consent) : reviewPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span>Confeitaria</span>
          <strong>Precificacao</strong>
        </div>
        <h1>Bem-vinda de volta</h1>
        <p>Entre para continuar com o controle de custos e margens.</p>
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
            />
          </label>
          <label>
            Senha
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <div className="divider">
          <span>ou</span>
        </div>
        <GoogleButton label="Entrar com Google" returnTo={safeMcpReviewPath((location.state as { from?: { pathname?: string } } | null)?.from?.pathname)} />
        <div className="login-hint">
          <span>Primeiro acesso?</span> <Link to="/register">Criar conta</Link>
        </div>
      </div>
    </div>
  );
};
