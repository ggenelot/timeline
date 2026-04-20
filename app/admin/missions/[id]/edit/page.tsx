'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { MissionForm, MissionFormState, MissionRequirementFormState } from '@/components/missions/mission-form';
import { supabase } from '@/lib/supabase/client';
import { Mission, Profile } from '@/lib/types';

function isPositiveInteger(value: string) {
  return /^[1-9]\d*$/.test(value);
}

type MissionSkillOption = {
  id: string;
  name: string | null;
};

type ParsedRequirement = {
  skill_id: string | null;
  quantity: number;
};

type MissionEditPayload = Mission & {
  mission_required_skills:
    | Array<{
        id: string;
        skill_id: string | null;
        quantity: number;
      }>
    | null;
};

function parseMissionRequirements(requirements: MissionRequirementFormState[]): { parsedRequirements: ParsedRequirement[]; error: string | null } {
  const trimmedRequirements = requirements
    .map((requirement) => ({
      skill_id: requirement.skill_id.trim(),
      quantity: requirement.quantity.trim()
    }))
    .filter((requirement) => requirement.skill_id.length > 0 || requirement.quantity.length > 0);

  const parsedRequirements: ParsedRequirement[] = [];
  const selectedSkillIds = new Set<string>();

  for (const requirement of trimmedRequirements) {
    if (!isPositiveInteger(requirement.quantity)) {
      return { parsedRequirements: [], error: 'La quantité doit être un entier strictement positif.' };
    }

    const normalizedSkillId = requirement.skill_id.length > 0 ? requirement.skill_id : null;
    const skillKey = normalizedSkillId ?? '__generic__';

    if (selectedSkillIds.has(skillKey)) {
      return { parsedRequirements: [], error: 'Un même besoin (compétence ou bénévole générique) ne peut pas être ajouté en double.' };
    }

    selectedSkillIds.add(skillKey);
    parsedRequirements.push({
      skill_id: normalizedSkillId,
      quantity: Number.parseInt(requirement.quantity, 10)
    });
  }

  return { parsedRequirements, error: null };
}

function isoToDateAndTime(value: string) {
  const normalized = new Date(value).toISOString();
  return {
    date: normalized.slice(0, 10),
    time: normalized.slice(11, 16)
  };
}

function missionToForm(mission: Mission): MissionFormState {
  const startsAt = isoToDateAndTime(mission.starts_at);
  const endsAt = isoToDateAndTime(mission.ends_at);

  return {
    title: mission.title,
    description: mission.description ?? '',
    location: mission.location ?? '',
    sector: mission.sector ?? '',
    category: mission.category,
    starts_at_date: startsAt.date,
    starts_at_time: startsAt.time,
    ends_at_date: endsAt.date,
    ends_at_time: endsAt.time,
    required_volunteers: String(mission.required_volunteers),
    status: mission.status
  };
}

export default function AdminEditMissionPage() {
  const params = useParams<{ id: string }>();
  const missionId = params.id;
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [form, setForm] = useState<MissionFormState | null>(null);
  const [requirements, setRequirements] = useState<MissionRequirementFormState[]>([]);
  const [skills, setSkills] = useState<MissionSkillOption[]>([]);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setError(null);
      setRequirementsError(null);

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

      if (profileData.role !== 'admin') {
        setProfile(profileData);
        setLoading(false);
        return;
      }

      const { data: missionData, error: missionError } = await supabase
        .from('missions')
        .select('id,title,description,location,sector,category,starts_at,ends_at,required_volunteers,status,created_by,created_at,mission_required_skills(id,skill_id,quantity)')
        .eq('id', missionId)
        .single<MissionEditPayload>();

      if (missionError || !missionData) {
        setError('Mission introuvable.');
        setProfile(profileData);
        setLoading(false);
        return;
      }

      setProfile(profileData);
      setMission(missionData);
      setForm(missionToForm(missionData));
      setRequirements(
        (missionData.mission_required_skills ?? []).map((requirement) => ({
          skill_id: requirement.skill_id ?? '',
          quantity: String(requirement.quantity ?? 1)
        }))
      );

      const { data: skillData, error: skillError } = await supabase
        .from('skills')
        .select('id,name')
        .order('name', { ascending: true });

      if (skillError) {
        setError(`Impossible de charger les compétences: ${skillError.message}`);
        setLoading(false);
        return;
      }

      setSkills(skillData ?? []);
      setLoading(false);
    }

    void loadData();
  }, [missionId, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRequirementsError(null);
    setSuccess(null);

    if (!profile || profile.role !== 'admin') {
      setError('Accès refusé : seuls les administrateurs peuvent modifier une mission.');
      return;
    }

    if (!mission || !form) {
      setError('Mission non chargée.');
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

    const { parsedRequirements, error: parsedRequirementsError } = parseMissionRequirements(requirements);
    if (parsedRequirementsError) {
      setRequirementsError(parsedRequirementsError);
      return;
    }

    setSubmitting(true);

    const { error: updateError } = await supabase
      .from('missions')
      .update({
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        sector: form.sector.trim() || null,
        category: form.category,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        required_volunteers: Number.parseInt(form.required_volunteers, 10),
        status: form.status
      })
      .eq('id', mission.id);

    if (updateError) {
      if (updateError.message.toLowerCase().includes('row-level security')) {
        setError("Action refusée par la politique d'accès (RLS). Vérifiez que votre profil est admin.");
      } else {
        setError(updateError.message);
      }
      setSubmitting(false);
      return;
    }

    const { error: deleteRequirementsError } = await supabase.from('mission_required_skills').delete().eq('mission_id', mission.id);

    if (deleteRequirementsError) {
      setError(`Mission mise à jour partiellement: impossible de synchroniser les besoins (${deleteRequirementsError.message}).`);
      setSubmitting(false);
      return;
    }

    if (parsedRequirements.length > 0) {
      const { error: insertRequirementsError } = await supabase.from('mission_required_skills').insert(
        parsedRequirements.map((requirement) => ({
          mission_id: mission.id,
          skill_id: requirement.skill_id,
          quantity: requirement.quantity
        }))
      );

      if (insertRequirementsError) {
        setError(`Mission mise à jour partiellement: impossible de synchroniser les besoins (${insertRequirementsError.message}).`);
        setSubmitting(false);
        return;
      }
    }

    setMission((prev) =>
      prev
        ? {
            ...prev,
            title: form.title.trim(),
            description: form.description.trim() || null,
            location: form.location.trim() || null,
            sector: form.sector.trim() || null,
            category: form.category,
            starts_at: startsAtIso,
            ends_at: endsAtIso,
            required_volunteers: Number.parseInt(form.required_volunteers, 10),
            status: form.status
          }
        : prev
    );

    setSuccess('Mission mise à jour avec succès.');
    setSubmitting(false);
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

  if (!mission || !form) {
    return <p className="text-sm text-red-600">{error ?? 'Mission introuvable.'}</p>;
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Modifier la mission</h1>
          <p className="mt-1 text-sm text-slate-600">Mettez à jour les champs de la mission puis enregistrez.</p>
        </div>

        <Link
          href={`/missions/${mission.id}`}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Voir la mission
        </Link>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div> : null}

      <MissionForm
        form={form}
        onChange={setForm}
        requirements={requirements}
        onRequirementsChange={setRequirements}
        requirementsError={requirementsError}
        availableSkills={skills.map((skill) => ({ id: skill.id, name: skill.name || 'Compétence sans nom' }))}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel="Enregistrer"
        submittingLabel="Enregistrement..."
      />
    </section>
  );
}
