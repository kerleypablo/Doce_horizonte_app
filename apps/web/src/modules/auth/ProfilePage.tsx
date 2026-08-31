import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext.tsx';
import { supabase } from '../shared/supabase.ts';

export const ProfilePage = () => {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email ?? '');
  const [providers, setProviders] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (!user?.token) return;
    supabase.auth.getUser(user.token).then(({ data }) => {
      if (!data.user) return;
      setEmail(data.user.email ?? user.email ?? '');
      setProviders((data.user.identities ?? []).map((identity) => identity.provider));
    }).catch(() => undefined);
  }, [user?.token]);

  const usesGoogle = providers.includes('google');
  const ensureSupabaseSession = async () => {
    if (!user?.token || !user.refreshToken) return;
    const { error } = await supabase.auth.setSession({ access_token: user.token, refresh_token: user.refreshToken });
    if (error) throw error;
  };

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailMessage(null);
    setEmailSaving(true);
    const nextEmail = email.trim().toLowerCase();
    try {
      await ensureSupabaseSession();
      const { error } = await supabase.auth.updateUser(
        { email: nextEmail },
        { emailRedirectTo: `${window.location.origin}/app/perfil` }
      );
      if (error) throw error;
      setEmailMessage('Enviamos a confirmação para os e-mails envolvidos. Confirme a alteração para concluir.');
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : 'Não foi possível solicitar a alteração de e-mail.');
    } finally {
      setEmailSaving(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setPasswordMessage('Use ao menos 8 caracteres na nova senha.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('A confirmação de senha não confere.');
      return;
    }
    setPasswordSaving(true);
    try {
      await ensureSupabaseSession();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(usesGoogle ? 'Senha criada. Você poderá entrar por Google ou por e-mail e senha.' : 'Senha atualizada com sucesso.');
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : 'Não foi possível atualizar a senha.');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <section className="profile-page">
      <header className="profile-hero">
        <div className="profile-avatar">{user?.avatarUrl ? <img src={user.avatarUrl} alt={user.name ?? 'Usuário'} /> : <span className="material-symbols-outlined" aria-hidden="true">person</span>}</div>
        <div><span>Minha conta</span><h1>{user?.name ?? 'Usuário'}</h1><small>{email || 'E-mail não informado'}</small></div>
      </header>

      <div className="profile-grid">
        <article className="profile-card">
          <div className="profile-card-heading"><span className="material-symbols-outlined" aria-hidden="true">mail</span><div><h2>E-mail</h2><p>A alteração precisa ser confirmada pelo e-mail enviado pelo Supabase.</p></div></div>
          <form className="form" onSubmit={handleEmailSubmit}>
            <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            {emailMessage ? <p className="profile-message">{emailMessage}</p> : null}
            <button type="submit" disabled={emailSaving}>{emailSaving ? 'Enviando...' : 'Alterar e-mail'}</button>
          </form>
        </article>

        <article className="profile-card">
          <div className="profile-card-heading"><span className="material-symbols-outlined" aria-hidden="true">lock</span><div><h2>{usesGoogle ? 'Criar senha' : 'Alterar senha'}</h2><p>{usesGoogle ? 'Sua conta Google continua conectada. Criar uma senha também libera o login por e-mail.' : 'Escolha uma senha nova para entrar no aplicativo.'}</p></div></div>
          <form className="form" onSubmit={handlePasswordSubmit}>
            <label>Nova senha<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label>
            <label>Confirmar nova senha<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>
            {passwordMessage ? <p className="profile-message">{passwordMessage}</p> : null}
            <button type="submit" disabled={passwordSaving}>{passwordSaving ? 'Salvando...' : usesGoogle ? 'Criar senha' : 'Alterar senha'}</button>
          </form>
        </article>
      </div>
    </section>
  );
};
