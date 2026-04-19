'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { MissionStatus, Profile } from '@/lib/types';

type MissionFormState = {
  title: string;
  description: string;
  location: string;
  sector: string;
  starts_at_date: string;
  starts_at_time: string;
  ends_at_date: string;
  ends_at_time: string;
  required_volunteers: string;
  status: MissionStatus;
};

const INITIAL_FORM: MissionFormState = {
  title: '',
  description: '',
  location: '',
  sector: '',
  starts_at_date: '',
  starts_at_time: '',
  ends_at_date: '',
  ends_at_time: '',
  required_volunteers: '1',
  status: 'draft'
};

const STATUS_OPTIONS: Array<{ value: MissionStatus; label: string }> = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'proposed', label: 'Proposée' },
  { value: 'closed', label: 'Clôturée' },
  { value: 'confirmed', label: 'Confirmée' },
  { value: 'cancelled', label: 'Annulée' }
];

function isPositiveInteger(value: string) {
  return /^[1-9]\d*$/.test(value);
}

export default function AdminCreateMissionPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<MissionFormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
        .select('id,full_name,email,role,sector,created_at')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profileData) {
        setError('Impossible de charger votre profil.');
        setLoading(false);
        return;
      }

      setProfile(profileData);
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
      setError('Accès refusé : seuls les administrateurs peuvent créer une mission.');
      return;
    }

    if (!form.title.trim()) {
      setError('Le titre est obligatoire.');
      return;
    }

    if (!form.starts_at_date || !form.starts_at_time) {
      setError('La date et l\'heure de début sont obligatoires.');
      return;
    }

    if (!form.ends_at_date || !form.ends_at_time) {
      setError('La date et l\'heure de fin sont obligatoires.');
      return;
    }

    if (!isPositiveInteger(form.required_volunteers)) {
      setError('Le nombre de bénévoles requis doit être un entier strictement positif.');
      return;
    }

    const startsAtIso = new Date(`${form.starts_at_date}T${form.starts_at_time}`).toISOString();
    const endsAtIso = new Date(`${form.ends_at_date}T${form.ends_at_time}`).toISOString();

    if (endsAtIso <= startsAtIso) {
      setError('La date/heure de fin doit être postérieure au début.');
      return;
    }

    setSubmitting(true);

    const { data: createdMission, error: insertError } = await supabase
      .from('missions')
      .insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        sector: form.sector.trim() || null,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        required_volunteers: Number.parseInt(form.required_volunteers, 10),
        status: form.status,
        created_by: profile.id
      })
      .select('id')
      .single();

    if (insertError) {
      if (insertError.message.toLowerCase().includes('row-level security')) {
        setError("Action refusée par la politique d'accès (RLS). Vérifiez que votre profil est admin.");
      } else {
        setError(insertError.message);
      }
      setSubmitting(false);
      return;
    }

    setSuccess('Mission créée avec succès. Redirection en cours...');
    setForm(INITIAL_FORM);

    window.setTimeout(() => {
      if (createdMission?.id) {
        router.push(`/missions/${createdMission.id}`);
        return;
      }
      router.push('/missions');
    }, 600);
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
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Créer une mission</h1>
        <p className="mt-1 text-sm text-slate-600">Renseignez les champs de la table <code>public.missions</code> hors colonnes techniques auto-générées.</p>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div> : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm text-slate-700">
          Titre *
          <input
            type="text"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Ex: Distribution alimentaire secteur Nord"
            disabled={submitting}
            required
          />
        </label>

        <label className="block text-sm text-slate-700">
          Description
          <textarea
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            className="mt-1 min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Détails opérationnels de la mission"
            disabled={submitting}
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Lieu
            <input
              type="text"
              value={form.location}
              onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Ex: Maison des associations"
              disabled={submitting}
            />
          </label>

          <label className="block text-sm text-slate-700">
            Secteur
            <input
              type="text"
              value={form.sector}
              onChange={(event) => setForm((prev) => ({ ...prev, sector: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Ex: Nord"
              disabled={submitting}
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm text-slate-700">Début *</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={form.starts_at_date}
                onChange={(event) => setForm((prev) => ({ ...prev, starts_at_date: event.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={submitting}
                required
              />
              <input
                type="time"
                value={form.starts_at_time}
                onChange={(event) => setForm((prev) => ({ ...prev, starts_at_time: event.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={submitting}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-slate-700">Fin *</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={form.ends_at_date}
                onChange={(event) => setForm((prev) => ({ ...prev, ends_at_date: event.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={submitting}
                required
              />
              <input
                type="time"
                value={form.ends_at_time}
                onChange={(event) => setForm((prev) => ({ ...prev, ends_at_time: event.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={submitting}
                required
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Bénévoles requis *
            <input
              type="number"
              min={1}
              step={1}
              value={form.required_volunteers}
              onChange={(event) => setForm((prev) => ({ ...prev, required_volunteers: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
              required
            />
          </label>

          <label className="block text-sm text-slate-700">
            Statut *
            <select
              value={form.status}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as MissionStatus }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
              required
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm text-slate-700">
          Créé par
          <input
            type="text"
            value={profile.full_name ? `${profile.full_name} (${profile.email})` : profile.email}
            className="mt-1 w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
            disabled
            readOnly
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Création...' : 'Créer la mission'}
        </button>
      </form>
    </section>
  );
}
