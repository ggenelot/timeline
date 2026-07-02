'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, Skill, SkillCategory } from '@/lib/types';
import { getSkillColorClass } from '@/components/skills/skill-badge';
import { Button } from '@/components/ui/button';

type CategoryWithSkills = SkillCategory & { skills: Skill[] };

type VolunteerFormState = {
  firstName: string;
  lastName: string;
  identifier: string;
  password: string;
  selectedSkillByCategory: Record<string, string | null>;
};

const INITIAL_FORM: VolunteerFormState = {
  firstName: '',
  lastName: '',
  identifier: '',
  password: '',
  selectedSkillByCategory: {},
};

export default function AdminCreateVolunteerPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<VolunteerFormState>(INITIAL_FORM);
  const [categories, setCategories] = useState<CategoryWithSkills[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function loadProfile() {
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id,full_name,email,role,sector,created_at')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profileData) {
        setError('Impossible de charger votre profil.');
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: catsData, error: catsError } = await supabase
        .from('skill_categories')
        .select('id,name,color,display_order,created_at,skills(id,name,display_order,category_id,created_at)')
        .order('display_order', { ascending: true })
        .order('display_order', { referencedTable: 'skills', ascending: true });

      if (catsError) {
        setError('Impossible de charger les compétences.');
        setLoading(false);
        return;
      }

      setCategories((catsData ?? []) as CategoryWithSkills[]);
      setLoading(false);
    }

    void loadProfile();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!profile) { setError('Vous devez être connecté.'); return; }
    if (profile.role !== 'admin') { setError('Accès refusé : seuls les administrateurs peuvent créer un bénévole.'); return; }

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const identifier = form.identifier.trim().toLowerCase();
    const password = form.password;
    const skillIds = Object.values(form.selectedSkillByCategory).filter((v): v is string => Boolean(v));

    if (!firstName) { setError('Le prénom est obligatoire.'); return; }
    if (!lastName) { setError('Le nom est obligatoire.'); return; }
    if (!identifier) { setError("Un identifiant est obligatoire."); return; }
    if (password.length < 10) { setError('Le mot de passe doit contenir au moins 10 caractères.'); return; }

    setSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) { setError('Session invalide.'); setSubmitting(false); return; }

    const response = await fetch('/api/admin/volunteers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ ...form, password, skill_ids: skillIds }),
    });

    const payload = (await response.json()) as { error?: string; message?: string };
    if (!response.ok) {
      setError(payload.error ?? 'La création du bénévole a échoué.');
      setSubmitting(false);
      return;
    }

    setSuccess(payload.message ?? 'Bénévole créé avec succès.');
    setForm(INITIAL_FORM);
    setSubmitting(false);
    router.push('/admin/volunteers?created=1');
  }

  if (loading) return <p className="text-sm text-ink-2">Chargement...</p>;
  if (!profile) return <p className="text-sm text-bad">{error ?? 'Accès refusé.'}</p>;
  if (profile.role !== 'admin') {
    return (
      <div className="rounded-lg border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
        Accès refusé : cette page est réservée aux administrateurs.
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-black leading-tight tracking-[-0.02em] text-ink">Ajouter un bénévole</h1>
          <p className="mt-1 text-sm text-ink-2">Créez un compte bénévole et son profil associé.</p>
        </div>
        <Link href="/admin/volunteers" className="inline-flex items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] border-line-field bg-surface-card px-4 py-2 text-sm font-bold text-ink-2 transition hover:bg-[#F4F6FB]">
          Retour à la liste
        </Link>
      </div>

      {error ? <div className="rounded-md border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}
      {success ? <div className="rounded-md border border-ok-line bg-ok-soft p-3 text-sm text-ok-text">{success}</div> : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-ink-2">
            Prénom
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
              className="mt-1 w-full rounded-[10px] border border-line-field px-3 py-2 text-sm"
              disabled={submitting}
              required
            />
          </label>
          <label className="block text-sm text-ink-2">
            Nom
            <input
              type="text"
              value={form.lastName}
              onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
              className="mt-1 w-full rounded-[10px] border border-line-field px-3 py-2 text-sm"
              disabled={submitting}
              required
            />
          </label>
        </div>

        <label className="block text-sm text-ink-2">
          Identifiant
          <input
            type="text"
            name="identifier"
            value={form.identifier}
            onChange={(e) => setForm((prev) => ({ ...prev, identifier: e.target.value }))}
            className="mt-1 w-full rounded-[10px] border border-line-field px-3 py-2 text-sm"
            placeholder="prenom.nom"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={submitting}
            required
          />
        </label>

        <label className="block text-sm text-ink-2">
          Mot de passe
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            className="mt-1 w-full rounded-[10px] border border-line-field px-3 py-2 text-sm"
            disabled={submitting}
            minLength={10}
            autoComplete="off"
            required
          />
        </label>

        <div className="space-y-3 rounded-md border border-line p-3">
          <p className="text-sm font-medium text-ink">Compétences</p>
          {categories.length === 0 ? (
            <p className="text-xs text-ink-3">Aucune catégorie de compétences définie.</p>
          ) : (
            categories.map((category) => {
              if (category.skills.length === 0) return null;
              const selectedSkillId = form.selectedSkillByCategory[category.id] ?? null;
              const selectedSkill = category.skills.find((s) => s.id === selectedSkillId);

              return (
                <div key={category.id} className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{category.name}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({
                        ...prev,
                        selectedSkillByCategory: { ...prev.selectedSkillByCategory, [category.id]: null },
                      }))}
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                        !selectedSkillId ? getSkillColorClass(category.color) : 'border-line-field bg-surface-sub text-ink-2'
                      }`}
                      disabled={submitting}
                    >
                      Aucune
                    </button>
                    {category.skills.map((skill) => {
                      const isHighlighted = selectedSkill
                        ? skill.display_order <= selectedSkill.display_order
                        : false;
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => setForm((prev) => ({
                            ...prev,
                            selectedSkillByCategory: { ...prev.selectedSkillByCategory, [category.id]: skill.id },
                          }))}
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium hover:opacity-80 ${
                            isHighlighted
                              ? getSkillColorClass(category.color)
                              : 'border-line-field bg-surface-sub text-ink-2'
                          }`}
                          disabled={submitting}
                        >
                          {skill.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Création en cours...' : 'Créer le bénévole'}
        </Button>
      </form>
    </section>
  );
}
