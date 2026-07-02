'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { MissionForm, MissionFormState, MissionTypeOption, MissionRequirementFormState, MissionMaterielRequirementFormState, MaterielTypeOption } from '@/components/missions/mission-form';
import { AdminBanner, AdminCard, AdminPageHeader, ghostButtonStyle, dangerButtonStyle } from '@/components/admin/ui';
import { supabase } from '@/lib/supabase/client';
import { Mission, Profile, MissionRequiredMateriel } from '@/lib/types';
import { AdminDeleteMissionButton } from '@/components/missions/admin-delete-mission-button';
import { MissionMaterielAssignmentPicker, CandidateContainer } from '@/components/missions/mission-materiel-assignment-picker';

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

type ParsedMaterielRequirement = {
  category_id: string;
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
  mission_required_materiels:
    | Array<{
        id: string;
        category_id: string;
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

function parseMissionMaterielRequirements(requirements: MissionMaterielRequirementFormState[]): { parsedRequirements: ParsedMaterielRequirement[]; error: string | null } {
  const trimmedRequirements = requirements
    .map((requirement) => ({
      category_id: requirement.category_id.trim(),
      quantity: requirement.quantity.trim()
    }))
    .filter((requirement) => requirement.category_id.length > 0 || requirement.quantity.length > 0);

  const parsedRequirements: ParsedMaterielRequirement[] = [];
  const selectedCategoryIds = new Set<string>();

  for (const requirement of trimmedRequirements) {
    if (!requirement.category_id) {
      return { parsedRequirements: [], error: 'Veuillez sélectionner un type de matériel pour chaque ligne.' };
    }

    if (!isPositiveInteger(requirement.quantity)) {
      return { parsedRequirements: [], error: 'La quantité doit être un entier strictement positif.' };
    }

    if (selectedCategoryIds.has(requirement.category_id)) {
      return { parsedRequirements: [], error: 'Un même type de matériel ne peut pas être ajouté en double.' };
    }

    selectedCategoryIds.add(requirement.category_id);
    parsedRequirements.push({
      category_id: requirement.category_id,
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
  const [materielRequirements, setMaterielRequirements] = useState<MissionMaterielRequirementFormState[]>([]);
  const [materielTypes, setMaterielTypes] = useState<MaterielTypeOption[]>([]);
  const [requiredMateriels, setRequiredMateriels] = useState<MissionRequiredMateriel[]>([]);
  const [candidateContainers, setCandidateContainers] = useState<CandidateContainer[]>([]);
  const [missionTypes, setMissionTypes] = useState<MissionTypeOption[]>([]);
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);
  const [materielRequirementsError, setMaterielRequirementsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadMaterielAssignments() {
    const { data: requirementsData, error: requirementsErr } = await supabase
      .from('mission_required_materiels')
      .select('id,mission_id,category_id,quantity,created_at,category:materiel_categories(id,name,color),assignments:mission_materiel_assignments(id,mission_required_materiel_id,materiel_type_id,assigned_by,created_at,materiel_type:materiel_types(id,name,code))')
      .eq('mission_id', missionId);

    if (requirementsErr || !requirementsData) {
      setRequiredMateriels([]);
      setCandidateContainers([]);
      return;
    }

    const mappedRequirements = requirementsData.map((requirement) => ({
      ...requirement,
      category: Array.isArray(requirement.category) ? requirement.category[0] ?? null : requirement.category,
      assignments: (requirement.assignments ?? []).map((assignment) => ({
        ...assignment,
        materiel_type: Array.isArray(assignment.materiel_type) ? assignment.materiel_type[0] ?? null : assignment.materiel_type
      }))
    }));
    setRequiredMateriels(mappedRequirements);

    const categoryIds = Array.from(new Set(mappedRequirements.map((requirement) => requirement.category_id)));
    if (categoryIds.length > 0) {
      const [containersResult, contentsResult] = await Promise.all([
        supabase.from('materiel_types').select('id,name,code,category_id').eq('is_container', true).in('category_id', categoryIds),
        supabase.from('materiel_type_contents').select('child_type_id')
      ]);
      const nestedContainerIds = new Set((contentsResult.data ?? []).map((row) => row.child_type_id));
      setCandidateContainers((containersResult.data ?? []).filter((c) => !nestedContainerIds.has(c.id)));
    } else {
      setCandidateContainers([]);
    }
  }

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

      // Mission, skills, materiel categories, location suggestions and the session are independent: fetch in parallel.
      const [missionResult, sessionResult, skillResult, materielResult, locationsResult] = await Promise.all([
        supabase
          .from('missions')
          .select('id,title,description,location,mission_type_id,starts_at,ends_at,required_volunteers,status,created_by,created_at,mission_required_skills(id,skill_id,quantity),mission_required_materiels(id,category_id,quantity)')
          .eq('id', missionId)
          .single<MissionEditPayload>(),
        supabase.auth.getSession(),
        supabase.from('skills').select('id,name,skill_categories(color)').order('name', { ascending: true }),
        supabase.from('materiel_categories').select('id,name,color').order('display_order', { ascending: true }),
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
      setMaterielRequirements(
        (missionData.mission_required_materiels ?? []).map((requirement) => ({
          category_id: requirement.category_id,
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

      const { data: materielData, error: materielError } = materielResult;

      if (materielError) {
        setError(`Impossible de charger les types de matériel: ${materielError.message}`);
        setLoading(false);
        return;
      }

      setMaterielTypes(
        (materielData ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color ?? null
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

      void loadMaterielAssignments();
    }

    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRequirementsError(null);
    setMaterielRequirementsError(null);
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

    const { parsedRequirements: parsedMaterielRequirements, error: parsedMaterielRequirementsError } = parseMissionMaterielRequirements(materielRequirements);
    if (parsedMaterielRequirementsError) {
      setMaterielRequirementsError(parsedMaterielRequirementsError);
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

    // Réconciliation plutôt que delete-all/insert-all : une catégorie déjà présente garde
    // son id, donc ses affectations de contenant (mission_materiel_assignments) survivent
    // à une modification de la mission qui ne touche pas le matériel requis.
    const { data: existingMaterielRequirements, error: existingMaterielRequirementsError } = await supabase
      .from('mission_required_materiels')
      .select('id,category_id,quantity')
      .eq('mission_id', mission.id);

    if (existingMaterielRequirementsError) {
      setError(`Mission mise à jour partiellement: impossible de synchroniser le matériel requis (${existingMaterielRequirementsError.message}).`);
      setSubmitting(false);
      return;
    }

    const existingByCategoryId = new Map((existingMaterielRequirements ?? []).map((requirement) => [requirement.category_id, requirement]));
    const nextCategoryIds = new Set(parsedMaterielRequirements.map((requirement) => requirement.category_id));

    const categoryIdsToRemove = (existingMaterielRequirements ?? [])
      .filter((requirement) => !nextCategoryIds.has(requirement.category_id))
      .map((requirement) => requirement.id);

    if (categoryIdsToRemove.length > 0) {
      const { error: deleteMaterielRequirementsError } = await supabase.from('mission_required_materiels').delete().in('id', categoryIdsToRemove);

      if (deleteMaterielRequirementsError) {
        setError(`Mission mise à jour partiellement: impossible de synchroniser le matériel requis (${deleteMaterielRequirementsError.message}).`);
        setSubmitting(false);
        return;
      }
    }

    const requirementsToInsert = parsedMaterielRequirements.filter((requirement) => !existingByCategoryId.has(requirement.category_id));
    const requirementsToUpdate = parsedMaterielRequirements.filter((requirement) => {
      const existing = existingByCategoryId.get(requirement.category_id);
      return existing !== undefined && existing.quantity !== requirement.quantity;
    });

    if (requirementsToInsert.length > 0) {
      const { error: insertMaterielRequirementsError } = await supabase.from('mission_required_materiels').insert(
        requirementsToInsert.map((requirement) => ({
          mission_id: mission.id,
          category_id: requirement.category_id,
          quantity: requirement.quantity
        }))
      );

      if (insertMaterielRequirementsError) {
        setError(`Mission mise à jour partiellement: impossible de synchroniser le matériel requis (${insertMaterielRequirementsError.message}).`);
        setSubmitting(false);
        return;
      }
    }

    for (const requirement of requirementsToUpdate) {
      const existing = existingByCategoryId.get(requirement.category_id)!;
      const { error: updateMaterielRequirementError } = await supabase
        .from('mission_required_materiels')
        .update({ quantity: requirement.quantity })
        .eq('id', existing.id);

      if (updateMaterielRequirementError) {
        setError(`Mission mise à jour partiellement: impossible de synchroniser le matériel requis (${updateMaterielRequirementError.message}).`);
        setSubmitting(false);
        return;
      }
    }

    // Seules les catégories retirées du besoin font perdre leurs pointages de vérification
    // (cascade sur mission_required_materiels) : on ne réinitialise donc le statut "vérifiée"
    // que si du matériel a réellement été retiré.
    if (categoryIdsToRemove.length > 0) {
      await supabase
        .from('mission_materiel_verifications')
        .update({ status: 'not_started', completed_by: null, completed_at: null, updated_at: new Date().toISOString() })
        .eq('mission_id', mission.id)
        .eq('status', 'completed');
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
    return <p style={{ fontSize: 14, color: '#5B6478' }}>Chargement…</p>;
  }

  if (!profile) {
    return <p style={{ fontSize: 14, color: '#D14343' }}>{error ?? 'Accès refusé.'}</p>;
  }

  if (profile.role !== 'admin') {
    return (
      <AdminBanner tone="error">Accès refusé : cette page est réservée aux administrateurs.</AdminBanner>
    );
  }

  if (!mission || !form) {
    return <p style={{ fontSize: 14, color: '#D14343' }}>{error ?? 'Mission introuvable.'}</p>;
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
        materielRequirements={materielRequirements}
        onMaterielRequirementsChange={setMaterielRequirements}
        materielRequirementsError={materielRequirementsError}
        availableMateriels={materielTypes}
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

        <MissionMaterielAssignmentPicker
          requirements={requiredMateriels}
          candidateContainers={candidateContainers}
          onChange={() => void loadMaterielAssignments()}
        />
      </div>
    </div>
  );
}
