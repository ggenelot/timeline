'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { AppRole, Profile, Skill } from '@/lib/types';
import { getSkillBadgeClass } from '@/components/skills/skill-badge';
import { compareSkillCodes, resolveSkillCode } from '@/lib/skills';

type SkillOption = Pick<Skill, 'id' | 'name' | 'category'>;

const SKILL_CATEGORIES = ['conduite', 'formation', 'operationnel', 'accso'] as const;

const SKILL_CATEGORY_LABELS: Record<(typeof SKILL_CATEGORIES)[number], string> = {
  conduite: 'TECHNIQUE',
  formation: 'FORMATION',
  operationnel: 'OPERATIONNEL',
  accso: 'ACCSO'
};

function normalizeSkillCategory(category: string | null | undefined): (typeof SKILL_CATEGORIES)[number] | null {
  const normalized = (category ?? '').toLowerCase();
  const key = normalized === 'technique' ? 'conduite' : normalized;

  return SKILL_CATEGORIES.includes(key as (typeof SKILL_CATEGORIES)[number])
    ? (key as (typeof SKILL_CATEGORIES)[number])
    : null;
}

type VolunteerPayload = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  sector: string | null;
  role: AppRole;
  created_at: string;
};

type VolunteerSkill = {
  skill_id: string;
  skill: SkillOption | SkillOption[] | null;
};

type EditVolunteerForm = {
  full_name: string;
  email: string;
  selectedSkillByCategory: Record<string, string | null>;
  password: string;
  confirmPassword: string;
};

const INITIAL_FORM: EditVolunteerForm = {
  full_name: '',
  email: '',
  selectedSkillByCategory: {},
  password: '',
  confirmPassword: ''
};

export default function EditVolunteerPage() {
  const params = useParams<{ id: string }>();
  const volunteerId = params.id;

  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<EditVolunteerForm>(INITIAL_FORM);
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
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

      if (profileData.role !== 'admin') {
        setError('Accès refusé : cette page est réservée aux administrateurs.');
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setError('Session invalide. Veuillez vous reconnecter.');
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/admin/volunteers/${volunteerId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const payload = (await response.json()) as {
        error?: string;
        volunteer?: VolunteerPayload;
        profileSkills?: VolunteerSkill[];
        skills?: SkillOption[];
      };

      if (!response.ok || !payload.volunteer) {
        setError(payload.error ?? 'Impossible de charger le bénévole.');
        setLoading(false);
        return;
      }

      const selectedSkillIds = (payload.profileSkills ?? []).map((profileSkill) => profileSkill.skill_id);
      const selectedSkillByCategory = (payload.skills ?? []).reduce<Record<string, string | null>>((acc, skill) => {
        if (!selectedSkillIds.includes(skill.id)) return acc;
        const category = normalizeSkillCategory(skill.category);
        if (category) {
          acc[category] = skill.id;
        }
        return acc;
      }, {});

      setForm({
        full_name: payload.volunteer.full_name ?? '',
        email: payload.volunteer.email,
        selectedSkillByCategory,
        password: '',
        confirmPassword: ''
      });
      setSkills(payload.skills ?? []);
      setLoading(false);
    }

    if (volunteerId) {
      void loadData();
    }
  }, [router, volunteerId]);


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!profile || profile.role !== 'admin') {
      setError('Accès refusé : seuls les administrateurs peuvent modifier un bénévole.');
      return;
    }

    if (!form.full_name.trim()) {
      setError('Le nom complet est obligatoire.');
      return;
    }

    if (!form.email.trim()) {
      setError('Un email valide est obligatoire.');
      return;
    }

    if (form.password && form.password.length < 10) {
      setError('Le nouveau mot de passe doit contenir au moins 10 caractères.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('La confirmation du mot de passe ne correspond pas.');
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

    const skillIds = Object.values(form.selectedSkillByCategory).filter((value): value is string => Boolean(value));

    const response = await fetch(`/api/admin/volunteers/${volunteerId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        full_name: form.full_name,
        email: form.email,
        skill_ids: skillIds,
        password: form.password || undefined
      })
    });

    const payload = (await response.json()) as { error?: string; message?: string };

    if (!response.ok) {
      setError(payload.error ?? "La mise à jour du bénévole a échoué.");
      setSubmitting(false);
      return;
    }

    setSuccess(payload.message ?? 'Bénévole modifié avec succès.');
    setSubmitting(false);

    router.push('/admin/volunteers?edited=1');
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Chargement...</p>;
  }

  if (!profile || profile.role !== 'admin') {
    return <p className="text-sm text-red-600">{error ?? 'Accès refusé.'}</p>;
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Modifier un bénévole</h1>
          <p className="mt-1 text-sm text-slate-600">Mettez à jour le profil et les compétences du bénévole.</p>
        </div>
        <Link href="/admin/volunteers" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          Retour à la liste
        </Link>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div> : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm text-slate-700">
          Nom complet
          <input
            type="text"
            value={form.full_name}
            onChange={(event) => setForm((previous) => ({ ...previous, full_name: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={submitting}
            required
          />
        </label>



        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Nouveau mot de passe (optionnel)
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
              minLength={10}
              autoComplete="new-password"
            />
          </label>

          <label className="block text-sm text-slate-700">
            Confirmer le mot de passe
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(event) => setForm((previous) => ({ ...previous, confirmPassword: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
              minLength={10}
              autoComplete="new-password"
            />
          </label>
        </div>

        <div className="space-y-3 rounded-md border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-900">Compétences</p>
          {SKILL_CATEGORIES.map((category) => {
            const categorySkills = skills
              .filter((skill) => normalizeSkillCategory(skill.category) === category)
              .sort((a, b) => {
                const codeA = resolveSkillCode(a.name);
                const codeB = resolveSkillCode(b.name);

                if (codeA && codeB) return compareSkillCodes(codeA, codeB);
                if (codeA) return -1;
                if (codeB) return 1;

                return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
              });

            if (categorySkills.length === 0) {
              return null;
            }

            const selectedSkillId = form.selectedSkillByCategory[category] ?? null;
            const selectedSkillIndex = categorySkills.findIndex((skill) => skill.id === selectedSkillId);

            return (
              <div key={category} className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{SKILL_CATEGORY_LABELS[category]}</p>
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
          {submitting ? 'Enregistrement en cours...' : 'Enregistrer les modifications'}
        </button>
      </form>
    </section>
  );
}
