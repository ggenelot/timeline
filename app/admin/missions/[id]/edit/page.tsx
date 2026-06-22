'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { MissionForm, MissionFormState, MissionTypeOption, MissionRequirementFormState } from '@/components/missions/mission-form';
import { AdminBanner, AdminCard, AdminPageHeader, ghostButtonStyle, dangerButtonStyle } from '@/components/admin/ui';
import { supabase } from '@/lib/supabase/client';
import { Mission, Profile } from '@/lib/types';
import { AdminDeleteMissionButton } from '@/components/missions/admin-delete-mission-button';

function isPositiveInteger(value: string) {
  return /^[1-9]\d*$/.test(value);
}

type MissionSkillOption = {
  id: string;
  name: string | null;
  color: string | null;
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
    
    mission_type_id: mission.mission_type_id,
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
  const [missionTypes, setMissionTypes] = useState<MissionTypeOption[]>([]);
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
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

      // Mission, skills, location suggestions and the session are independent: fetch in parallel.
      const [missionResult, sessionResult, skillResult, locationsResult] = await Promise.all([
        supabase
          .from('missions')
          .select('id,title,description,location,mission_type_id,starts_at,ends_at,required_volunteers,status,created_by,created_at,mission_required_skills(id,skill_id,quantity)')
          .eq('id', missionId)
          .single<MissionEditPayload>(),
        supabase.auth.getSession(),
        supabase.from('skills').select('id,name,skill_categories(color)').order('name', { ascending: true }),
        supabase.from('missions').select('location').not('location', 'is', null),
      ]);

      const { data: missionData, error: missionError } = missionResult;

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

      const tok = sessionResult.data.session?.access_token ?? '';
      const typesRes = await fetch('/api/mission-types', { headers: { Authorization: `Bearer ${tok}` } });
      if (typesRes.ok) {
        const typesJson = (await typesRes.json()) as { missionTypes: MissionTypeOption[] };
        setMissionTypes(typesJson.missionTypes);
      }

      const { data: skillData, error: skillError } = skillResult;

      if (skillError) {
        setError(`Impossible de charger les compétences: ${skillError.message}`);
        setLoading(false);
        return;
      }

      setSkills(
        (skillData ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          color: (s.skill_categories as { color?: string } | null)?.color ?? null
        }))
      );

      const { data: locationsData, error: locationsError } = locationsResult;

      if (locationsError) {
        setError(`Impossible de charger les suggestions de lieux: ${locationsError.message}`);
        setLoading(false);
        return;
      }

      const suggestions = Array.from(
        new Set(
          (locationsData ?? [])
            .map((row) => row.location?.trim() ?? '')
            .filter((location) => location.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b, 'fr'));

      setLocationSuggestions(suggestions);
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
        
        mission_type_id: form.mission_type_id,
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
            
            mission_type_id: form.mission_type_id,
            starts_at: startsAtIso,
            ends_at: endsAtIso,
            required_volunteers: Number.parseInt(form.required_volunteers, 10),
            status: form.status
          }
        : prev
    );

    setSuccess('Mission mise à jour avec succès.');
    setSubmitting(false);
    router.push(`/missions/${mission.id}`);
  }

  if (loading) {
    return <p style={{ fontSize: 14, color: '#64748b' }}>Chargement…</p>;
  }

  if (!profile) {
    return <p style={{ fontSize: 14, color: '#dc2626' }}>{error ?? 'Accès refusé.'}</p>;
  }

  if (profile.role !== 'admin') {
    return (
      <AdminBanner tone="error">Accès refusé : cette page est réservée aux administrateurs.</AdminBanner>
    );
  }

  if (!mission || !form) {
    return <p style={{ fontSize: 14, color: '#dc2626' }}>{error ?? 'Mission introuvable.'}</p>;
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <AdminPageHeader
        title="Modifier la mission"
        subtitle="Mettez à jour les informations de la mission puis enregistrez."
        actions={
          <Link href={`/missions/${mission.id}`} style={ghostButtonStyle}>
            Voir la mission
          </Link>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error ? <AdminBanner tone="error">{error}</AdminBanner> : null}
        {success ? <AdminBanner tone="success">{success}</AdminBanner> : null}

        <AdminCard>
          <MissionForm
        form={form}
        onChange={setForm}
        missionTypes={missionTypes}
        requirements={requirements}
        onRequirementsChange={setRequirements}
        requirementsError={requirementsError}
        availableSkills={skills.map((skill) => ({ id: skill.id, name: skill.name || 'Compétence sans nom', color: skill.color }))}
        locationSuggestions={locationSuggestions}
        onSubmit={handleSubmit}
        submitting={submitting}
          submitLabel="Enregistrer"
          submittingLabel="Enregistrement..."
          footerActions={
            <AdminDeleteMissionButton
              missionId={mission.id}
              style={dangerButtonStyle}
              onError={(message) => {
                setError(message);
                setSuccess(null);
              }}
              onDeleted={() => {
                router.push('/missions');
              }}
            />
          }
          />
        </AdminCard>
      </div>
    </div>
  );
}
