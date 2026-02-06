import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from './AuthContext.tsx';
import { GoogleButton } from './GoogleButton.tsx';

export const RegisterPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const signup = await apiFetch<{ token: string }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      await apiFetch('/onboarding/company', {
        method: 'POST',
        token: signup.token,
        body: JSON.stringify({ companyName })
      });

      login(signup.token, 'admin');
      navigate('/app/empresa');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta');
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
        <h1>Criar conta</h1>
        <p>Crie sua empresa e comece a precificar.</p>
        <form onSubmit={handleSubmit}>
          <label>
            Nome da empresa
            <input
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              required
            />
          </label>
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
            {loading ? 'Criando...' : 'Criar conta'}
          </button>
        </form>
        <div className="divider">
          <span>ou</span>
        </div>
        <GoogleButton label="Continuar com Google" />
        <div className="login-hint">Ja tem conta? Volte para o login.</div>
      </div>
    </div>
  );
};
