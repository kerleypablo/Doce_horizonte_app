import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from './AuthContext.tsx';
import { GoogleButton } from './GoogleButton.tsx';

export const RegisterPage = () => {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
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

      if (mode === 'create') {
        await apiFetch('/onboarding/company', {
          method: 'POST',
          token: signup.token,
          body: JSON.stringify({ companyName })
        });
      } else {
        await apiFetch('/onboarding/join-company', {
          method: 'POST',
          token: signup.token,
          body: JSON.stringify({ companyCode })
        });
      }

      const me = await apiFetch<{ role: 'admin' | 'common' }>('/auth/me', { token: signup.token });
      login(signup.token, me.role);
      navigate('/app');
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
        <p>Crie uma empresa nova ou use o codigo de uma empresa existente.</p>
        <div className="tabs">
          <button
            type="button"
            className={mode === 'create' ? 'tab-icon active' : 'tab-icon'}
            onClick={() => setMode('create')}
            aria-label="Criar empresa"
          >
            <span className="material-symbols-outlined" aria-hidden="true">add_business</span>
          </button>
          <button
            type="button"
            className={mode === 'join' ? 'tab-icon active' : 'tab-icon'}
            onClick={() => setMode('join')}
            aria-label="Entrar com codigo"
          >
            <span className="material-symbols-outlined" aria-hidden="true">group_add</span>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {mode === 'create' ? (
            <label>
              Nome da empresa
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
              />
            </label>
          ) : (
            <label>
              Codigo da empresa
              <input
                value={companyCode}
                onChange={(event) => setCompanyCode(event.target.value.toUpperCase())}
                placeholder="Ex.: A1B2C3D4"
                required
              />
            </label>
          )}
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
