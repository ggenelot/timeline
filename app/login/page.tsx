'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { useBranding } from '@/lib/branding/branding-context';
import { cn } from '@/lib/cn';

type Mode = 'password' | 'otp';
type OtpStep = 'request' | 'verify';

const RESEND_COOLDOWN_S = 30;

function LoginPageContent() {
  const [mode, setMode] = useState<Mode>('password');

  // Connexion par mot de passe (historique).
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Connexion par code Slack (OTP 6 chiffres).
  const [otpStep, setOtpStep] = useState<OtpStep>('request');
  const [otpIdentifier, setOtpIdentifier] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const router = useRouter();
  const branding = useBranding();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

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

  async function requestOtp() {
    const value = otpIdentifier.trim();
    if (!value) {
      setOtpError('Saisis ton identifiant ou ton pseudo Slack.');
      return;
    }
    setOtpLoading(true);
    setOtpError(null);
    try {
      await fetch('/api/auth/slack/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slackIdentifier: value })
      });
      // Réponse volontairement neutre (anti-énumération) : on n'indique jamais si le compte existe.
      setOtpStep('verify');
      setOtpNotice('Si un compte existe, un code vient d’être envoyé sur Slack.');
      setCooldown(RESEND_COOLDOWN_S);
    } catch {
      setOtpError('Impossible d’envoyer le code pour le moment.');
    } finally {
      setOtpLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = otpCode.replace(/\s+/g, '');
    if (code.length !== 6) {
      setOtpError('Le code contient 6 chiffres.');
      return;
    }
    setOtpLoading(true);
    setOtpError(null);
    try {
      const response = await fetch('/api/auth/slack/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: otpIdentifier.trim(), code })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        token_hash?: string | null;
        action_link?: string | null;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        setOtpError(payload.error ?? 'Code invalide ou expiré.');
        setOtpLoading(false);
        return;
      }

      if (payload.token_hash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ type: 'email', token_hash: payload.token_hash });
        if (!verifyError) {
          router.push('/missions');
          return;
        }
      }
      // Repli : navigation vers le lien d’action Supabase si verifyOtp échoue ou est indisponible.
      if (payload.action_link) {
        window.location.assign(payload.action_link);
        return;
      }
      setOtpError('Connexion impossible. Demande un nouveau code.');
    } catch {
      setOtpError('Connexion impossible pour le moment.');
    } finally {
      setOtpLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-[26px] border border-line bg-surface-card shadow-lift">
      {/* Héros navy — logo de l'antenne à l'honneur */}
      <div
        className="relative overflow-hidden px-8 pb-16 pt-12"
        style={{
          background:
            'linear-gradient(160deg, color-mix(in srgb, white 8%, var(--color-brand, #002D74)) 0%, var(--color-brand, #002D74) 55%, color-mix(in srgb, black 25%, var(--color-brand, #002D74)) 100%)'
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
            <div className="font-display text-[23px] uppercase tracking-[0.05em]">{branding.orgName}</div>
            <div className="mt-1 text-[12px] uppercase tracking-[0.2em] text-[#9FB6E0]">
              {branding.orgTagline}
            </div>
          </div>
        </div>
      </div>

      {/* Feuille blanche remontante */}
      <div className="relative -mt-8 rounded-t-[30px] bg-surface-card px-8 pb-8 pt-8">
        <div className="mb-6 text-center">
          <div className="text-[24px] font-black tracking-[-0.01em] text-ink">Connexion</div>
          <div className="mt-1.5 font-hand text-[15px] text-accent-text">{branding.loginGreeting}</div>
        </div>

        {/* Sélecteur de mode */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-[14px] border border-line-field bg-surface-sub p-1">
          {(
            [
              { key: 'password', label: 'Mot de passe' },
              { key: 'otp', label: 'Code par Slack' }
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMode(tab.key)}
              className={cn(
                'h-9 rounded-[10px] text-[13px] font-bold transition',
                mode === tab.key ? 'bg-surface-card text-ink shadow-sm' : 'text-ink-3 hover:text-ink-2'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === 'password' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="mb-1.5 block text-[12.5px] font-bold text-ink-2">
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
              <label htmlFor="password" className="mb-1.5 block text-[12.5px] font-bold text-ink-2">
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
              <p className="rounded-[10px] border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>
            ) : null}

            <Button type="submit" variant="primary" disabled={loading} className="h-[52px] w-full rounded-[14px] text-[15.5px]">
              {loading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>
        ) : otpStep === 'request' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void requestOtp();
            }}
            className="space-y-4"
          >
            <p className="text-[13px] leading-relaxed text-ink-2">
              Reçois un code à 6 chiffres par message Slack pour te connecter sans mot de passe.
            </p>
            <div>
              <label htmlFor="otp-identifier" className="mb-1.5 block text-[12.5px] font-bold text-ink-2">
                Identifiant ou @Slack
              </label>
              <div className="flex h-[52px] items-center gap-2.5 rounded-[14px] border-[1.5px] border-line-field bg-surface-sub px-4 focus-within:border-brand">
                <Icon name="person" size={20} className="text-ink-3" />
                <input
                  id="otp-identifier"
                  type="text"
                  required
                  autoCapitalize="none"
                  autoComplete="username"
                  value={otpIdentifier}
                  onChange={(event) => setOtpIdentifier(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-4"
                />
              </div>
            </div>

            {otpError ? (
              <p className="rounded-[10px] border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">{otpError}</p>
            ) : null}

            <Button type="submit" variant="primary" disabled={otpLoading} className="h-[52px] w-full rounded-[14px] text-[15.5px]">
              {otpLoading ? 'Envoi...' : 'Recevoir un code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-4">
            {otpNotice ? (
              <p className="rounded-[10px] border border-line-field bg-surface-sub px-3 py-2 text-[13px] text-ink-2">{otpNotice}</p>
            ) : null}
            <div>
              <label htmlFor="otp-code" className="mb-1.5 block text-[12.5px] font-bold text-ink-2">
                Code à 6 chiffres
              </label>
              <div className="flex h-[52px] items-center gap-2.5 rounded-[14px] border-[1.5px] border-line-field bg-surface-sub px-4 focus-within:border-brand">
                <Icon name="lock" size={20} className="text-ink-3" />
                <input
                  id="otp-code"
                  type="text"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ''))}
                  className="min-w-0 flex-1 bg-transparent text-[17px] tracking-[0.3em] text-ink outline-none placeholder:text-ink-4"
                />
              </div>
            </div>

            {otpError ? (
              <p className="rounded-[10px] border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">{otpError}</p>
            ) : null}

            <Button type="submit" variant="primary" disabled={otpLoading} className="h-[52px] w-full rounded-[14px] text-[15.5px]">
              {otpLoading ? 'Connexion...' : 'Se connecter'}
            </Button>

            <button
              type="button"
              onClick={() => void requestOtp()}
              disabled={otpLoading || cooldown > 0}
              className="w-full text-center text-[13px] font-bold text-brand underline disabled:opacity-50"
            >
              {cooldown > 0 ? `Renvoyer un code (${cooldown}s)` : 'Renvoyer un code'}
            </button>
          </form>
        )}
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
