'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

function LoginPageContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slackLoading, setSlackLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const slackStatus = searchParams.get('slack');
  const slackReason = searchParams.get('reason');



  async function handleSlackLogin() {
    setSlackLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/slack/start', {
        method: 'POST'
      });
      const payload = (await response.json().catch(() => ({}))) as { oauthUrl?: string; error?: string };

      if (!response.ok || !payload.oauthUrl) {
        throw new Error(payload.error ?? 'Connexion Slack impossible.');
      }

      window.location.href = payload.oauthUrl;
    } catch (slackError) {
      setError(slackError instanceof Error ? slackError.message : 'Connexion Slack impossible.');
      setSlackLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);

    if (signInError) {
      setError('Connexion impossible. Vérifiez vos identifiants.');
      return;
    }

    router.push('/missions');
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Connexion</h1>
      <p className="mb-6 text-sm text-slate-600">Utilisez un compte de test Supabase pour accéder aux missions.</p>

      {slackStatus === 'state_invalid' || slackStatus === 'auth_failed' || slackStatus === 'magic_invalid' ? (<p className='mb-4 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700'>Connexion Slack impossible. Réessayez ou connectez-vous par email.{slackReason ? ` Détail: ${slackReason}` : ''}</p>) : null}
      <div className="mb-4 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
        La connexion Slack est limitée aux comptes Timeline déjà liés à une identité Slack.
      </div>

      <button
        type="button"
        onClick={handleSlackLogin}
        disabled={slackLoading}
        className="mb-4 w-full rounded-md bg-[#4A154B] px-4 py-2 text-sm text-white hover:bg-[#611f69] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {slackLoading ? 'Redirection vers Slack...' : 'Se connecter avec Slack'}
      </button>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
