import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from './AuthContext.tsx';

export const OnboardingPage = () => {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [companyName, setCompanyName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const token = sessionStorage.getItem('pending_token');
    if (!token) navigate('/login');
  }, [navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = sessionStorage.getItem('pending_token');
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      if (mode === 'create') {
        await apiFetch('/onboarding/company', {
          method: 'POST',
          token,
          body: JSON.stringify({ companyName })
        });
      } else {
        await apiFetch('/onboarding/join-company', {
          method: 'POST',
          token,
          body: JSON.stringify({ companyCode })
        });
      }

      const me = await apiFetch<{ role: 'master' | 'admin' | 'common' }>('/auth/me', { token });
      login(token, me.role);
      sessionStorage.removeItem('pending_token');
      navigate('/app/empresa');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao concluir onboarding');
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
        <h1>Primeiro acesso</h1>
        <p>Crie uma empresa nova ou entre com o codigo de uma empresa existente.</p>
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
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Processando...' : mode === 'create' ? 'Criar empresa' : 'Entrar na empresa'}
          </button>
        </form>
      </div>
    </div>
  );
};
