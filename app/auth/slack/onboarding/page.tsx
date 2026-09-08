'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

type Account = { id: string; full_name: string | null; identifier: string | null };
type SkillRef = { id: string; name: string; display_order: number; category_id: string | null };
type SkillCategory = { id: string; name: string; color: string | null; display_order: number; skills: SkillRef[] };
type Mode = 'choose' | 'claim' | 'create';

type AuthPayload = { ok?: boolean; token_hash?: string | null; action_link?: string | null; error?: string };

function OnboardingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<SkillCategory[]>([]);

  const [mode, setMode] = useState<Mode>('choose');
  const [search, setSearch] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadContext() {
      if (!token) {
        setFatalError('Lien invalide. Réécris au bot Timeline pour en recevoir un nouveau.');
        setPhase('error');
        return;
      }
      try {
        const resp = await fetch('/api/auth/slack/onboarding/context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const payload = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          accounts?: Account[];
          skill_categories?: SkillCategory[];
          error?: string;
        };
        if (!active) return;
        if (!resp.ok || !payload.ok) {
          setFatalError(payload.error ?? 'Lien invalide ou expiré.');
          setPhase('error');
          return;
        }
        setAccounts(payload.accounts ?? []);
        setCategories(payload.skill_categories ?? []);
        setPhase('ready');
      } catch {
        if (!active) return;
        setFatalError('Impossible de charger la page pour le moment. Réessaie dans un instant.');
        setPhase('error');
      }
    }
    void loadContext();
    return () => {
      active = false;
    };
  }, [token]);

  // Ouvre la session à partir du lien magique renvoyé par l'action (association ou création).
  const finishLogin = useCallback(
    async (payload: AuthPayload) => {
      if (payload.token_hash) {
        const { error } = await supabase.auth.verifyOtp({ type: 'email', token_hash: payload.token_hash });
        if (!error) {
          router.push('/missions');
          return true;
        }
      }
      if (payload.action_link) {
        window.location.assign(payload.action_link);
        return true;
      }
      return false;
    },
    [router]
  );

  const filteredAccounts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('fr');
    if (!term) return accounts;
    return accounts.filter(
      (a) =>
        (a.full_name ?? '').toLocaleLowerCase('fr').includes(term) ||
        (a.identifier ?? '').toLocaleLowerCase('fr').includes(term)
    );
  }, [accounts, search]);

  const claimAccount = async (profileId: string) => {
    setBusy(true);
    setActionError(null);
    try {
      const resp = await fetch('/api/auth/slack/onboarding/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, profile_id: profileId })
      });
      const payload = (await resp.json().catch(() => ({}))) as AuthPayload;
      if (!resp.ok || !payload.ok) {
        setActionError(payload.error ?? 'Impossible de rattacher ce compte.');
        return;
      }
      if (!(await finishLogin(payload))) setActionError('Connexion impossible. Réécris au bot pour un nouveau lien.');
    } catch {
      setActionError('Impossible de rattacher ce compte pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    if (!fullName.trim()) {
      setActionError('Indique ton nom.');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const resp = await fetch('/api/auth/slack/onboarding/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, full_name: fullName.trim(), skill_ids: selectedSkillIds })
      });
      const payload = (await resp.json().catch(() => ({}))) as AuthPayload;
      if (!resp.ok || !payload.ok) {
        setActionError(payload.error ?? 'Impossible de créer le compte.');
        return;
      }
      if (!(await finishLogin(payload))) setActionError('Compte créé, mais connexion impossible. Réécris au bot pour un lien.');
    } catch {
      setActionError('Impossible de créer le compte pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSkill = (id: string) =>
    setSelectedSkillIds((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]));

  if (phase === 'loading') {
    return <p className="mx-auto max-w-md px-6 py-16 text-center text-sm text-ink-2">Chargement…</p>;
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="rounded-[12px] border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">{fatalError}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <div className="mb-6 text-center">
        <div className="text-[24px] font-black tracking-[-0.01em] text-ink">Bienvenue sur Timeline</div>
        <p className="mt-1.5 text-[14px] text-ink-2">
          Retrouve ton compte s’il existe déjà, ou crée-le en quelques secondes.
        </p>
      </div>

      {actionError ? (
        <p className="mb-4 rounded-[10px] border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">{actionError}</p>
      ) : null}

      {mode === 'choose' ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setMode('claim')}
            className="w-full rounded-[16px] border border-line-field bg-surface-card px-5 py-4 text-left transition hover:border-brand"
          >
            <div className="text-[15px] font-bold text-ink">J’ai déjà un compte</div>
            <div className="mt-0.5 text-[13px] text-ink-2">Retrouve-le dans la liste et rattache-le à ton Slack.</div>
          </button>
          <button
            type="button"
            onClick={() => setMode('create')}
            className="w-full rounded-[16px] border border-line-field bg-surface-card px-5 py-4 text-left transition hover:border-brand"
          >
            <div className="text-[15px] font-bold text-ink">Créer mon compte</div>
            <div className="mt-0.5 text-[13px] text-ink-2">Renseigne ton nom et tes compétences.</div>
          </button>
        </div>
      ) : null}

      {mode === 'claim' ? (
        <div className="space-y-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher ton nom ou identifiant"
            autoFocus
            className="w-full rounded-full border border-line-field bg-surface-sub px-4 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent-ring focus:bg-surface-card focus:outline-none"
          />
          <div className="max-h-80 divide-y divide-line-row overflow-y-auto rounded-[12px] border border-line">
            {filteredAccounts.length === 0 ? (
              <p className="p-3 text-sm text-ink-3">Aucun compte ne correspond.</p>
            ) : (
              filteredAccounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => claimAccount(account.id)}
                  disabled={busy}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface-sub disabled:opacity-50"
                >
                  <span className="text-sm font-bold text-ink">{account.full_name || account.identifier || 'Compte'}</span>
                  {account.identifier ? <span className="font-mono text-xs text-ink-3">{account.identifier}</span> : null}
                </button>
              ))
            )}
          </div>
          <button type="button" onClick={() => setMode('choose')} className="text-[13px] font-bold text-ink-3 underline">
            ← Retour
          </button>
        </div>
      ) : null}

      {mode === 'create' ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="ob-name" className="mb-1.5 block text-[12.5px] font-bold text-ink-2">
              Ton nom
            </label>
            <input
              id="ob-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Prénom Nom"
              autoFocus
              className="w-full rounded-[12px] border border-line-field bg-surface-sub px-4 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:border-brand focus:bg-surface-card focus:outline-none"
            />
          </div>

          {categories.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[12.5px] font-bold text-ink-2">Tes compétences (optionnel)</p>
              {categories.map((category) =>
                category.skills.length === 0 ? null : (
                  <div key={category.id} className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">{category.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {category.skills.map((skill) => {
                        const active = selectedSkillIds.includes(skill.id);
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() => toggleSkill(skill.id)}
                            className={cn(
                              'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium transition',
                              active ? 'border-brand bg-brand/10 text-brand' : 'border-line bg-surface-sub text-ink-2 hover:border-ink-3'
                            )}
                          >
                            {skill.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : null}

          <Button onClick={createAccount} disabled={busy} className="h-[50px] w-full rounded-[14px] text-[15px]">
            {busy ? 'Création…' : 'Créer mon compte et me connecter'}
          </Button>
          <button type="button" onClick={() => setMode('choose')} className="block text-[13px] font-bold text-ink-3 underline">
            ← Retour
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function SlackOnboardingPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-md px-6 py-16 text-center text-sm text-ink-2">Chargement…</p>}>
      <OnboardingContent />
    </Suspense>
  );
}
