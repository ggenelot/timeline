'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { MissionCategory, MISSION_CATEGORY_LABELS, Profile } from '@/lib/types';

type AptitudeData = {
  id: string;
  name: string;
  allowed_categories: MissionCategory[];
};

function isPositiveInteger(value: string) {
  return /^[1-9]\d*$/.test(value);
}

export default function VolunteerCreateMissionPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [aptitudes, setAptitudes] = useState<AptitudeData[]>([]);
  const [allowedCategories, setAllowedCategories] = useState<MissionCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<MissionCategory | ''>('');
  const [startsAtDate, setStartsAtDate] = useState('');
  const [startsAtTime, setStartsAtTime] = useState('');
  const [endsAtDate, setEndsAtDate] = useState('');
  const [endsAtTime, setEndsAtTime] = useState('');
  const [requiredVolunteers, setRequiredVolunteers] = useState('1');

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id,full_name,email,phone,role,sector,created_at')
        .eq('id', authData.user.id)
        .single();

      if (!profileData) { setError('Profil introuvable.'); setLoading(false); return; }

      setProfile(profileData);

      // Admins/responsables should use the admin creation page
      if (profileData.role !== 'benevole') {
        router.replace('/admin/missions/create');
        return;
      }

      // Fetch user's aptitudes
      const { data: sessionData } = await supabase.auth.getSession();
      const tok = sessionData.session?.access_token ?? '';
      const res = await fetch('/api/aptitudes/mine', { headers: { Authorization: `Bearer ${tok}` } });

      if (res.ok) {
        const json = (await res.json()) as { aptitudes: AptitudeData[] };
        setAptitudes(json.aptitudes);
        const cats = Array.from(new Set(json.aptitudes.flatMap((a) => a.allowed_categories)));
        setAllowedCategories(cats);
        if (cats.length === 1) setCategory(cats[0]);
      }

      setLoading(false);
    }
    void init();
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!profile) { setError('Vous devez être connecté.'); return; }
    if (!title.trim()) { setError('Le titre est obligatoire.'); return; }
    if (!category) { setError('La catégorie est obligatoire.'); return; }
    if (!startsAtDate || !startsAtTime) { setError('La date et l\'heure de début sont obligatoires.'); return; }
    if (!endsAtDate || !endsAtTime) { setError('La date et l\'heure de fin sont obligatoires.'); return; }
    if (!isPositiveInteger(requiredVolunteers)) { setError('Le nombre de bénévoles doit être un entier > 0.'); return; }

    const startsAt = new Date(`${startsAtDate}T${startsAtTime}`).toISOString();
    const endsAt = new Date(`${endsAtDate}T${endsAtTime}`).toISOString();
    if (endsAt <= startsAt) { setError('La fin doit être postérieure au début.'); return; }

    setSubmitting(true);

    const { data: mission, error: insertError } = await supabase
      .from('missions')
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        category,
        starts_at: startsAt,
        ends_at: endsAt,
        required_volunteers: Number.parseInt(requiredVolunteers, 10),
        status: 'draft',
        created_by: profile.id
      })
      .select('id')
      .single();

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    router.push(`/missions/${mission.id}`);
  }

  if (loading) return <p className="text-sm text-slate-600">Chargement...</p>;

  if (!profile) return <p className="text-sm text-red-600">Accès refusé.</p>;

  if (allowedCategories.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Vous n&apos;avez pas d&apos;aptitude vous permettant de créer des missions. Contactez un administrateur.
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Proposer une mission</h1>
        <p className="mt-1 text-sm text-slate-500">
          La mission sera créée en <span className="font-medium text-amber-700">brouillon</span> et devra être validée par un administrateur avant d&apos;être proposée aux bénévoles.
        </p>
        {aptitudes.length > 0 ? (
          <p className="mt-1 text-xs text-slate-400">
            Vos aptitudes : {aptitudes.map((a) => a.name).join(', ')}
          </p>
        ) : null}
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Titre <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        {/* Category */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Type d&apos;événement <span className="text-red-500">*</span></label>
          <div className="flex flex-wrap gap-2">
            {allowedCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  category === cat
                    ? 'border-emerald-400 bg-emerald-100 text-emerald-800'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {MISSION_CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        {/* Location */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Lieu</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Début <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <input
                type="date"
                value={startsAtDate}
                onChange={(e) => setStartsAtDate(e.target.value)}
                required
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
              <input
                type="time"
                value={startsAtTime}
                onChange={(e) => setStartsAtTime(e.target.value)}
                required
                className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Fin <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <input
                type="date"
                value={endsAtDate}
                onChange={(e) => setEndsAtDate(e.target.value)}
                required
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
              <input
                type="time"
                value={endsAtTime}
                onChange={(e) => setEndsAtTime(e.target.value)}
                required
                className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
          </div>
        </div>

        {/* Required volunteers */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nombre de bénévoles requis <span className="text-red-500">*</span></label>
          <input
            type="number"
            min={1}
            value={requiredVolunteers}
            onChange={(e) => setRequiredVolunteers(e.target.value)}
            className="w-32 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting || !category}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Envoi...' : 'Soumettre en brouillon'}
          </button>
        </div>
      </form>
    </section>
  );
}
