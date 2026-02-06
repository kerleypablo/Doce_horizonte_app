import { supabase } from '../shared/supabase.ts';

export const GoogleButton = ({ label }: { label: string }) => {
  const handleClick = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/oauth` }
    });
  };

  return (
    <button type="button" className="google-button" onClick={handleClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.7 4.7 0 0 1-2 3.1v2.6h3.2c1.9-1.7 3-4.2 3-7.5z" fill="#4285F4" />
        <path d="M12 22c2.7 0 5-1 6.7-2.7l-3.2-2.6c-.9.6-2.1 1-3.5 1a6 6 0 0 1-5.7-4.2H3.1v2.7A10 10 0 0 0 12 22z" fill="#34A853" />
        <path d="M6.3 13.5A6 6 0 0 1 6 12c0-.5.1-1 .3-1.5V7.8H3.1A10 10 0 0 0 2 12c0 1.6.4 3.1 1.1 4.4l3.2-2.9z" fill="#FBBC05" />
        <path d="M12 6c1.5 0 2.8.5 3.9 1.6l2.9-2.9A9.6 9.6 0 0 0 12 2 10 10 0 0 0 3.1 7.8l3.2 2.7A6 6 0 0 1 12 6z" fill="#EA4335" />
      </svg>
      {label}
    </button>
  );
};
