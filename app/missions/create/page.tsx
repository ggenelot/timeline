'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, RoleBehavior } from '@/lib/types';
import { Button } from '@/components/ui/button';

type MissionTypeOption = { id: string; name: string };

function isPositiveInteger(value: string) {
  return /^[1-9]\d*$/.test(value);
}

export default function VolunteerCreateMissionPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [allMissionTypes, setAllMissionTypes] = useState<MissionTypeOption[]>([]);
  const [allowedMissionTypeIds, setAllowedMissionTypeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [missionTypeId, setMissionTypeId] = useState('');
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
        .select('id,full_name,email,role,sector,created_at')
        .eq('id', authData.user.id)
        .single();

      if (!profileData) { setError('Profil introuvable.'); setLoading(false); return; }

      setProfile(profileData);

      if (profileData.role !== 'benevole') {
        router.replace('/admin/missions/create');
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const tok = sessionData.session?.access_token ?? '';

      const [typesRes, rolesRes] = await Promise.all([
        fetch('/api/mission-types', { headers: { Authorization: `Bearer ${tok}` } }),
        fetch('/api/roles/mine', { headers: { Authorization: `Bearer ${tok}` } }),
      ]);

      let allTypeIds: string[] = [];
      if (typesRes.ok) {
        const typesJson = (await typesRes.json()) as { missionTypes: MissionTypeOption[] };
        setAllMissionTypes(typesJson.missionTypes);
        allTypeIds = typesJson.missionTypes.map((t) => t.id);
      }

      if (rolesRes.ok) {
        const rolesJson = (await rolesRes.json()) as { roles: Array<{ name: string }>; behaviors: RoleBehavior[] };
        setRoleNames(rolesJson.roles.map((r) => r.name));
        const canCreateBehaviors = rolesJson.behaviors.filter((b) => b.behavior_type === 'can_create');
        const canCreateIds = canCreateBehaviors.some((b) => (b.mission_type_ids ?? []).length === 0)
          ? allTypeIds
          : Array.from(new Set(canCreateBehaviors.flatMap((b) => b.mission_type_ids ?? [])));
        setAllowedMissionTypeIds(canCreateIds);
        if (canCreateIds.length === 1) setMissionTypeId(canCreateIds[0]);
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
    if (!missionTypeId) { setError('La catégorie est obligatoire.'); return; }
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
        mission_type_id: missionTypeId,
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

  if (loading) return <p className="text-sm text-ink-2">Chargement...</p>;

  if (!profile) return <p className="text-sm text-bad">Accès refusé.</p>;

  if (allowedMissionTypeIds.length === 0) {
    return (
      <div className="rounded-2xl border border-warn-line bg-warn-soft p-4 text-sm text-warn-text">
        Vous n&apos;avez pas de rôle vous permettant de créer des missions. Contactez un administrateur.
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface-card p-4 shadow-card md:p-6">
      <div>
        <h1 className="text-[26px] font-black leading-tight tracking-[-0.02em] text-ink">Proposer une mission</h1>
        <p className="mt-1 text-sm text-ink-2">
          La mission sera créée en <span className="font-medium text-warn-text">brouillon</span> et devra être validée par un administrateur avant d&apos;être proposée aux bénévoles.
        </p>
        {roleNames.length > 0 ? (
          <p className="mt-1 text-xs text-ink-3">
            Vos rôles : {roleNames.join(', ')}
          </p>
        ) : null}
      </div>

      {error ? <div className="rounded-md border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-2">Titre <span className="text-bad">*</span></label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded-[10px] border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent-ring"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink-2">Type d&apos;événement <span className="text-bad">*</span></label>
          <div className="flex flex-wrap gap-2">
            {allMissionTypes.filter((mt) => allowedMissionTypeIds.includes(mt.id)).map((mt) => (
              <button
                key={mt.id}
                type="button"
                onClick={() => setMissionTypeId(mt.id)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  missionTypeId === mt.id
                    ? 'border-ok-line bg-ok-soft text-ok-text'
                    : 'border-line-field bg-surface-sub text-ink-2 hover:bg-line-row'
                }`}
              >
                {mt.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-[10px] border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent-ring"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink-2">Lieu</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-[10px] border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent-ring"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-2">Début <span className="text-bad">*</span></label>
            <div className="flex gap-2">
              <input
                type="date"
                value={startsAtDate}
                onChange={(e) => setStartsAtDate(e.target.value)}
                required
                className="flex-1 rounded-[10px] border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-ring"
              />
              <input
                type="time"
                value={startsAtTime}
                onChange={(e) => setStartsAtTime(e.target.value)}
                required
                className="w-28 rounded-[10px] border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-ring"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-2">Fin <span className="text-bad">*</span></label>
            <div className="flex gap-2">
              <input
                type="date"
                value={endsAtDate}
                onChange={(e) => setEndsAtDate(e.target.value)}
                required
                className="flex-1 rounded-[10px] border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-ring"
              />
              <input
                type="time"
                value={endsAtTime}
                onChange={(e) => setEndsAtTime(e.target.value)}
                required
                className="w-28 rounded-[10px] border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-ring"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink-2">Nombre de bénévoles requis <span className="text-bad">*</span></label>
          <input
            type="number"
            min={1}
            value={requiredVolunteers}
            onChange={(e) => setRequiredVolunteers(e.target.value)}
            className="w-32 rounded-[10px] border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-ring"
          />
        </div>

        <div className="flex items-center justify-between border-t border-line-row pt-4">
          <Button variant="ghost" onClick={() => router.back()}>
            Annuler
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || !missionTypeId}
          >
            {submitting ? 'Envoi...' : 'Soumettre en brouillon'}
          </Button>
        </div>
      </form>
    </section>
  );
}
