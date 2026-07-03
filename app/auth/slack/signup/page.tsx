'use client';
import { FormEvent, useEffect, useState } from 'react';

export default function SlackSignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('slack_invite_token');
    if (!token) return;
    fetch(`/api/auth/slack/invite?token=${encodeURIComponent(token)}`).then(async (r) => {
      const p = await r.json();
      if (r.ok && p.email) setEmail(p.email);
    }).catch(() => undefined);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const params = new URLSearchParams(window.location.search);
    const response = await fetch('/api/auth/slack/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, slackTeamId: params.get('team'), slackUserId: params.get('user'), inviteToken: params.get('slack_invite_token') }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error ?? 'Création impossible');
    window.location.href = payload.next ?? '/login';
  }

  return <form onSubmit={handleSubmit} className="mx-auto mt-10 max-w-md space-y-4 rounded-2xl border border-line bg-surface-card p-6 shadow-card"><h1 className="text-[26px] font-black leading-tight tracking-[-0.02em] text-ink">Créer un compte</h1><input className="w-full rounded-[10px] border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent-ring" placeholder="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required/><input className="w-full rounded-[10px] border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent-ring" placeholder="Mot de passe" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required/>{error ? <p className="text-sm text-bad">{error}</p>:null}<button className="inline-flex items-center justify-center gap-1.5 rounded-[11px] bg-brand px-4 py-2 text-sm font-bold text-white shadow-[0_8px_18px_-6px_var(--color-brand-shadow)] transition hover:bg-brand-for" type="submit">Créer mon compte</button></form>;
}
