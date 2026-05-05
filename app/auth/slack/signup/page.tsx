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

  return <form onSubmit={handleSubmit} className="mx-auto mt-10 max-w-md space-y-4 rounded border p-6"><h1 className="text-xl font-semibold">Créer un compte</h1><input className="w-full rounded border p-2" placeholder="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required/><input className="w-full rounded border p-2" placeholder="Mot de passe" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required/>{error ? <p className="text-sm text-red-600">{error}</p>:null}<button className="rounded bg-slate-900 px-4 py-2 text-white" type="submit">Créer mon compte</button></form>;
}
