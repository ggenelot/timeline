'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slackIdentifier, setSlackIdentifier] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const router = useRouter();
  const slackStatus = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('slack') : null), []);
  const slackReason = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('reason') : null), []);

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
      <button type='button' onClick={async () => { const response = await fetch('/api/auth/slack/start', { method: 'POST' }); const payload = await response.json(); if (response.ok && payload.oauthUrl) { window.location.href = payload.oauthUrl; } else { setError(payload.error ?? 'Connexion Slack impossible.'); } }} className='mb-4 w-full rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100'>Se connecter avec Slack</button>


      <div className="mb-6 rounded-md border border-slate-200 bg-slate-50 p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Connexion Slack par OTP</h2>
        <p className="mb-3 text-xs text-slate-600">Entrez votre identifiant Slack (ex: @prenom.nom ou U123ABC45). Nous vous envoyons un lien OTP en message privé Slack.</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={slackIdentifier}
            onChange={(event) => setSlackIdentifier(event.target.value)}
            placeholder="@identifiant-slack"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-300 focus:ring"
          />
          <button
            type="button"
            disabled={otpLoading}
            onClick={async () => {
              setOtpLoading(true);
              setError(null);
              setOtpMessage(null);
              const response = await fetch('/api/auth/slack/otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slackIdentifier })
              });
              const payload = await response.json();
              if (!response.ok) {
                setError(payload.error ?? "Impossible d'envoyer l'OTP Slack.");
              } else {
                setOtpMessage('Si cet identifiant Slack est reconnu, un lien OTP a été envoyé en message privé Slack.');
              }
              setOtpLoading(false);
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {otpLoading ? 'Envoi...' : 'Recevoir OTP'}
          </button>
        </div>
        {otpMessage ? <p className="mt-2 text-xs text-emerald-700">{otpMessage}</p> : null}
        <div className="mt-3 flex gap-2">
          <input type="text" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} placeholder="Coller OTP reçu" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button type="button" onClick={async () => {
            const response = await fetch('/api/auth/slack/otp/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp: otpCode }) });
            const payload = await response.json();
            if (!response.ok) { setError(payload.error ?? 'OTP invalide'); return; }
            window.location.href = payload.next;
          }} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">Valider OTP</button>
        </div>
      </div>

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
