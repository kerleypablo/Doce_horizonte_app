import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { supabase } from '../shared/supabase.ts';
import { useAuth } from './AuthContext.tsx';

export function OAuthConsentPage() {
  const { user } = useAuth();
  const location = useLocation();
  const authorizationId = new URLSearchParams(location.search).get('authorization_id');
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!user || !authorizationId) return;
    (async () => {
      if (user.refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({ access_token: user.token, refresh_token: user.refreshToken });
        if (sessionError) { if (!cancelled) setError('Sessao invalida. Entre novamente.'); return; }
      }
      const { data, error: authError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (cancelled) return;
      if (authError || !data) { setError('Nao foi possivel carregar a solicitacao de autorizacao.'); return; }
      if ('redirect_url' in data) { window.location.assign(data.redirect_url); return; }
      setDetails(data);
    })().catch(() => { if (!cancelled) setError('Nao foi possivel carregar a solicitacao.'); });
    return () => { cancelled = true; };
  }, [user, authorizationId]);
  const decide = async (approved: boolean) => {
    if (!authorizationId) return;
    setBusy(true); setError(null);
    try {
      const { data, error: decisionError } = approved
        ? await supabase.auth.oauth.approveAuthorization(authorizationId)
        : await supabase.auth.oauth.denyAuthorization(authorizationId);
      if (decisionError || !data?.redirect_url) { setError('Nao foi possivel registrar sua decisao.'); return; }
      window.location.assign(data.redirect_url);
    } catch { setError('Nao foi possivel registrar sua decisao.'); }
    finally { setBusy(false); }
  };
  return <main className="login-page"><div className="login-card">
    <h1>Autorizar aplicativo</h1>
    {!authorizationId ? <p>Solicitacao de autorizacao ausente.</p> : !user ? <p>Entre na sua conta para revisar a solicitacao. <Link to={`/login?consent=${encodeURIComponent(authorizationId)}`}>Entrar</Link></p> : <>
      {details && <><p><strong>{details.client.name || 'Aplicativo'}</strong> solicita acesso para {details.user.email}.</p>
        <p>Permissoes solicitadas: {details.scope || 'nenhuma informada'}</p>
        <p>Retorno para: {details.redirect_uri}</p>
        <p>O acesso MCP permite consultar os dados disponiveis para sua conta e empresa.</p>
        <button disabled={busy} onClick={() => void decide(true)}>Autorizar</button>{' '}
        <button disabled={busy} onClick={() => void decide(false)}>Negar</button></>}
      {!details && !error && <p>Carregando solicitacao...</p>}
    </>}
    {error && <p role="alert">{error}</p>}
  </div></main>;
}
