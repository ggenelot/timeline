'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { useBranding } from '@/lib/branding/branding-context';

function LoginPageContent() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const branding = useBranding();

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

    const resolveResponse = await fetch('/api/auth/resolve-identifier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: normalizedIdentifier })
    });

    const resolvePayload = (await resolveResponse.json()) as { email?: string | null };
    const resolvedEmail = typeof resolvePayload.email === 'string' ? resolvePayload.email : null;

    if (resolvedEmail) {
      const { error } = await trySignIn(resolvedEmail);
      signInError = error;
    } else if (normalizedIdentifier.includes('@')) {
      const { error } = await trySignIn(normalizedIdentifier);
      signInError = error;
    } else {
      signInError = new Error('Profile not found');
    }

    setLoading(false);

    if (signInError) {
      setError('Connexion impossible. Vérifiez vos identifiants.');
      return;
    }

    router.push('/missions');
  }

  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-[26px] border border-line bg-surface-card shadow-lift">
      {/* Héros navy — logo de l'antenne à l'honneur */}
      <div
        className="relative overflow-hidden px-8 pb-16 pt-12"
        style={{
          background:
            'linear-gradient(160deg, color-mix(in srgb, white 8%, var(--color-brand)) 0%, var(--color-brand) 55%, color-mix(in srgb, black 25%, var(--color-brand)) 100%)'
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg,rgba(255,255,255,.05) 0 2px,transparent 2px 16px)'
          }}
        />
        <div className="relative flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo personnalisable (URL admin), hôte inconnu à la compilation */}
          <img
            src={branding.logoUrl ?? '/logo.png'}
            alt="Logo"
            width={128}
            height={128}
            className="h-32 w-32 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,.35)]"
          />
          <div className="text-center text-white">
            <div className="font-display text-[23px] tracking-[0.05em]">PROTEC DU 8 &amp; DU 9</div>
            <div className="mt-1 text-[12px] tracking-[0.2em] text-[#9FB6E0]">
              PROTECTION CIVILE PARIS SEINE
            </div>
          </div>
        </div>
      </div>

      {/* Feuille blanche remontante */}
      <div className="relative -mt-8 rounded-t-[30px] bg-surface-card px-8 pb-8 pt-8">
        <div className="mb-6 text-center">
          <div className="text-[24px] font-black tracking-[-0.01em] text-ink">Connexion</div>
          <div className="mt-1.5 font-hand text-[15px] text-accent-text">contente de te revoir</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="identifier"
              className="mb-1.5 block text-[12.5px] font-bold text-ink-2"
            >
              Identifiant
            </label>
            <div className="flex h-[52px] items-center gap-2.5 rounded-[14px] border-[1.5px] border-line-field bg-surface-sub px-4 focus-within:border-brand">
              <Icon name="person" size={20} className="text-ink-3" />
              <input
                id="identifier"
                type="text"
                required
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-4"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[12.5px] font-bold text-ink-2"
            >
              Mot de passe
            </label>
            <div className="flex h-[52px] items-center gap-2.5 rounded-[14px] border-[1.5px] border-line-field bg-surface-sub px-4 focus-within:border-brand">
              <Icon name="lock" size={20} className="text-ink-3" />
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-4"
              />
            </div>
          </div>

          {error ? (
            <p className="rounded-[10px] border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" disabled={loading} className="h-[52px] w-full rounded-[14px] text-[15.5px]">
            {loading ? 'Connexion...' : 'Se connecter'}
          </Button>
        </form>
      </div>
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
