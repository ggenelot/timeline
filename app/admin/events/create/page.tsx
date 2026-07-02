'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';
import { Card, PageHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type EventFormState = {
  title: string;
  description: string;
  date: string;
};

const INITIAL_FORM: EventFormState = {
  title: '',
  description: '',
  date: ''
};

export default function AdminCreateEventPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<EventFormState>(INITIAL_FORM);
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
        .select('id,full_name,email,identifier,role,sector,created_at')
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
      setError('Accès refusé : seuls les administrateurs peuvent créer un événement.');
      return;
    }

    if (!form.title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }

    if (!form.date) {
      setError("La date est obligatoire.");
      return;
    }

    setSubmitting(true);

    const { error: insertError } = await supabase.from('events').insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      date: new Date(form.date).toISOString(),
      created_by: profile.id
    });

    if (insertError) {
      if (insertError.message.toLowerCase().includes('row-level security')) {
        setError("Action refusée par la politique d'accès (RLS). Vérifiez votre rôle administrateur.");
      } else {
        setError(insertError.message);
      }
      setSubmitting(false);
      return;
    }

    setSuccess('Événement créé avec succès.');
    setForm(INITIAL_FORM);
    setSubmitting(false);
  }

  if (loading) {
    return <p className="text-sm text-ink-2">Chargement...</p>;
  }

  if (!profile) {
    return <p className="text-sm text-bad">{error ?? 'Accès refusé.'}</p>;
  }

  if (profile.role !== 'admin') {
    return (
      <div className="rounded-[10px] border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
        Accès refusé : cette page est réservée aux administrateurs.
      </div>
    );
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Créer un événement"
        subtitle="Ajoutez un nouvel événement visible par les utilisateurs connectés."
      />

      <div className="flex flex-col gap-4">
        {error ? <div className="rounded-[10px] border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}
        {success ? <div className="rounded-[10px] border border-ok-line bg-ok-soft p-3 text-sm text-ok-text">{success}</div> : null}

        <Card className="p-5">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm font-semibold text-ink-2">
              Titre
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                className="mt-1.5 w-full rounded-[10px] border border-line-field bg-surface-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring"
                placeholder="Ex: Formation premiers secours"
                disabled={submitting}
                required
              />
            </label>

            <label className="block text-sm font-semibold text-ink-2">
              Description
              <textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                className="mt-1.5 min-h-28 w-full rounded-[10px] border border-line-field bg-surface-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring"
                placeholder="Détails de l'événement"
                disabled={submitting}
              />
            </label>

            <label className="block text-sm font-semibold text-ink-2">
              Date
              <input
                type="datetime-local"
                value={form.date}
                onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                className="mt-1.5 w-full rounded-[10px] border border-line-field bg-surface-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring"
                disabled={submitting}
                required
              />
            </label>

            <Button type="submit" disabled={submitting}>
              {submitting ? "Création..." : "Créer l'événement"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
