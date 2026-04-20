'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { AppRole, Profile } from '@/lib/types';

type SkillOption = {
  id: string;
  name: string;
};

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
  phone: string;
  sector: string;
  role: 'benevole' | 'responsable';
  skill_ids: string[];
};

const INITIAL_FORM: EditVolunteerForm = {
  full_name: '',
  email: '',
  phone: '',
  sector: '',
  role: 'benevole',
  skill_ids: []
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
  const [skillToAdd, setSkillToAdd] = useState('');
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

      setForm({
        full_name: payload.volunteer.full_name ?? '',
        email: payload.volunteer.email,
        phone: payload.volunteer.phone ?? '',
        sector: payload.volunteer.sector ?? '',
        role: payload.volunteer.role === 'responsable' ? 'responsable' : 'benevole',
        skill_ids: selectedSkillIds
      });
      setSkills(payload.skills ?? []);
      setLoading(false);
    }

    if (volunteerId) {
      void loadData();
    }
  }, [router, volunteerId]);

  const selectedSkillOptions = useMemo(
    () =>
      form.skill_ids
        .map((skillId) => skills.find((skill) => skill.id === skillId))
        .filter((skill): skill is SkillOption => Boolean(skill)),
    [form.skill_ids, skills]
  );

  const availableSkillOptions = useMemo(
    () => skills.filter((skill) => !form.skill_ids.includes(skill.id)),
    [form.skill_ids, skills]
  );

  function handleAddSkill() {
    if (!skillToAdd || form.skill_ids.includes(skillToAdd)) {
      return;
    }

    setForm((previous) => ({
      ...previous,
      skill_ids: [...previous.skill_ids, skillToAdd]
    }));
    setSkillToAdd('');
  }

  function handleRemoveSkill(skillId: string) {
    setForm((previous) => ({
      ...previous,
      skill_ids: previous.skill_ids.filter((id) => id !== skillId)
    }));
  }

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

    setSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setError('Session invalide. Veuillez vous reconnecter.');
      setSubmitting(false);
      return;
    }

    const response = await fetch(`/api/admin/volunteers/${volunteerId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(form)
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
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
              required
            />
          </label>

          <label className="block text-sm text-slate-700">
            Téléphone
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Secteur
            <input
              type="text"
              value={form.sector}
              onChange={(event) => setForm((previous) => ({ ...previous, sector: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
            />
          </label>

          <label className="block text-sm text-slate-700">
            Rôle
            <select
              value={form.role}
              onChange={(event) => setForm((previous) => ({ ...previous, role: event.target.value as 'benevole' | 'responsable' }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
            >
              <option value="benevole">bénévole</option>
              <option value="responsable">responsable</option>
            </select>
          </label>
        </div>

        <div className="space-y-3 rounded-md border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-900">Compétences</p>

          {selectedSkillOptions.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune compétence attribuée.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedSkillOptions.map((skill) => (
                <span key={skill.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800">
                  {skill.name}
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill.id)}
                    className="font-bold text-slate-500 hover:text-slate-900"
                    disabled={submitting}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-64 flex-1 text-sm text-slate-700">
              Ajouter une compétence
              <select
                value={skillToAdd}
                onChange={(event) => setSkillToAdd(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={submitting || availableSkillOptions.length === 0}
              >
                <option value="">Sélectionner...</option>
                {availableSkillOptions.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={handleAddSkill}
              disabled={submitting || !skillToAdd}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Ajouter
            </button>
          </div>
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
