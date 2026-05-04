'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, Skill } from '@/lib/types';
import { getSkillBadgeClass } from '@/components/skills/skill-badge';

type VolunteerFormState = {
  firstName: string;
  lastName: string;
  identifier: string;
  password: string;
  selectedSkillByCategory: Record<string, string | null>;
};

type SkillOption = Pick<Skill, 'id' | 'name' | 'category'>;

const INITIAL_FORM: VolunteerFormState = {
  firstName: '',
  lastName: '',
  identifier: '',
  password: '',
  selectedSkillByCategory: {}
};

export default function AdminCreateVolunteerPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<VolunteerFormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const router = useRouter();

  useEffect(() => {
    async function loadProfile() {
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace('/login');
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id,full_name,email,phone,role,sector,created_at')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profileData) {
        setError('Impossible de charger votre profil.');
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: skillsData, error: skillsError } = await supabase.from('skills').select('id,name,category').order('name', { ascending: true });
      if (skillsError) {
        setError('Impossible de charger les compétences.');
        setLoading(false);
        return;
      }

      setSkills(skillsData ?? []);
      setLoading(false);
    }

    void loadProfile();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!profile) {
      setError('Vous devez être connecté.');
      return;
    }

    if (profile.role !== 'admin') {
      setError('Accès refusé : seuls les administrateurs peuvent créer un bénévole.');
      return;
    }

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const identifier = form.identifier.trim().toLowerCase();
    const password = form.password;
    const skillIds = Object.values(form.selectedSkillByCategory).filter((value): value is string => Boolean(value));

    if (!firstName) {
      setError('Le prénom est obligatoire.');
      return;
    }

    if (!lastName) {
      setError('Le nom est obligatoire.');
      return;
    }

    if (!identifier) {
      setError('Un identifiant est obligatoire.');
      return;
    }

    if (password.length < 10) {
      setError('Le mot de passe doit contenir au moins 10 caractères.');
      return;
    }

    setSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setError('Session invalide. Veuillez vous reconnecter.');
      setSubmitting(false);
      return;
    }

    const response = await fetch('/api/admin/volunteers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ ...form, password, skill_ids: skillIds })
    });

    const payload = (await response.json()) as { error?: string; message?: string };

    if (!response.ok) {
      setError(payload.error ?? "La création du bénévole a échoué.");
      setSubmitting(false);
      return;
    }

    setSuccess(payload.message ?? 'Bénévole créé avec succès.');
    setForm(INITIAL_FORM);
    setSubmitting(false);

    router.push('/admin/volunteers?created=1');
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Chargement...</p>;
  }

  if (!profile) {
    return <p className="text-sm text-red-600">{error ?? 'Accès refusé.'}</p>;
  }

  if (profile.role !== 'admin') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Accès refusé : cette page est réservée aux administrateurs.
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Ajouter un bénévole</h1>
          <p className="mt-1 text-sm text-slate-600">Créez un compte bénévole et son profil associé.</p>
        </div>
        <Link href="/admin/volunteers" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          Retour à la liste
        </Link>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div> : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Prénom
            <input
              type="text"
              value={form.firstName}
              onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
              required
            />
          </label>

          <label className="block text-sm text-slate-700">
            Nom
            <input
              type="text"
              value={form.lastName}
              onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
              required
            />
          </label>
        </div>

        <label className="block text-sm text-slate-700">
          Identifiant
          <input
            type="text"
            value={form.identifier}
            onChange={(event) => setForm((prev) => ({ ...prev, identifier: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="prenom.nom"
            disabled={submitting}
            required
          />
        </label>

        <label className="block text-sm text-slate-700">
          Mot de passe
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={submitting}
            minLength={10}
            autoComplete="new-password"
            required
          />
        </label>

        <div className="space-y-3 rounded-md border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-900">Compétences</p>
          {Array.from(new Set(skills.map((skill) => skill.category))).map((category) => {
            const categorySkills = skills.filter((skill) => skill.category === category);
            const selectedSkillId = form.selectedSkillByCategory[category] ?? null;
            const selectedSkillIndex = categorySkills.findIndex((skill) => skill.id === selectedSkillId);

            return (
              <div key={category} className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{category}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, selectedSkillByCategory: { ...prev.selectedSkillByCategory, [category]: null } }))}
                    className={`${getSkillBadgeClass(category)} px-2.5 py-1`}
                    disabled={submitting}
                  >
                    Aucune
                  </button>
                  {categorySkills.map((skill, skillIndex) => {
                    const shouldUseCategoryColor = selectedSkillIndex >= 0 && skillIndex <= selectedSkillIndex;
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, selectedSkillByCategory: { ...prev.selectedSkillByCategory, [category]: skill.id } }))}
                        className={`${shouldUseCategoryColor ? getSkillBadgeClass(category) : 'inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600'} hover:opacity-80`}
                        disabled={submitting}
                      >
                        {skill.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Création en cours...' : 'Créer le bénévole'}
        </button>
      </form>
    </section>
  );
}
