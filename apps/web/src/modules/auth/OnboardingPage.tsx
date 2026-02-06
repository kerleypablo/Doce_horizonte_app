import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from './AuthContext.tsx';

export const OnboardingPage = () => {
  const [companyName, setCompanyName] = useState('');
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
      await apiFetch('/onboarding/company', {
        method: 'POST',
        token,
        body: JSON.stringify({ companyName })
      });

      const me = await apiFetch<{ role: 'admin' | 'common' }>('/auth/me', { token });
      login(token, me.role);
      sessionStorage.removeItem('pending_token');
      navigate('/app/empresa');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar empresa');
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
        <h1>Crie sua empresa</h1>
        <p>Antes de continuar, informe o nome da sua empresa.</p>
        <form onSubmit={handleSubmit}>
          <label>
            Nome da empresa
            <input
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Criando...' : 'Criar empresa'}
          </button>
        </form>
      </div>
    </div>
  );
};
