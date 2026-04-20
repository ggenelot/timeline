'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MissionForm, MissionFormState, INITIAL_MISSION_FORM } from '@/components/missions/mission-form';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';

function isPositiveInteger(value: string) {
  return /^[1-9]\d*$/.test(value);
}

export default function AdminCreateMissionPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<MissionFormState>(INITIAL_MISSION_FORM);
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
    setForm(INITIAL_MISSION_FORM);

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

      <MissionForm
        form={form}
        onChange={setForm}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel="Créer la mission"
        submittingLabel="Création..."
        createdByLabel={profile.full_name ? `${profile.full_name} (${profile.email})` : profile.email}
      />
    </section>
  );
}
