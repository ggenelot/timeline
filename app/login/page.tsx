'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

function LoginPageContent() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const normalizedIdentifier = identifier.trim().toLowerCase();

    const trySignIn = async (email: string) =>
      supabase.auth.signInWithPassword({
        email,
        password
      });

    let signInError: Error | null = null;

    if (normalizedIdentifier.includes('@')) {
      const { error } = await trySignIn(normalizedIdentifier);
      signInError = error;
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('identifier', normalizedIdentifier)
        .maybeSingle<{ email: string }>();

      if (profile?.email) {
        const { error } = await trySignIn(profile.email);
        signInError = error;
      } else {
        signInError = new Error('Profile not found');
      }
    }

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
      <p className="mb-6 text-sm text-slate-600">Utilisez votre compte Timeline pour accéder aux missions.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="identifier" className="mb-1 block text-sm font-medium text-slate-700">
            Identifiant
          </label>
          <input
            id="identifier"
            type="text"
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
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
