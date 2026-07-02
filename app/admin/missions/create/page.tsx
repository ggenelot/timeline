'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MissionForm, MissionFormState, MissionTypeOption, INITIAL_MISSION_FORM, MissionRequirementFormState, MissionMaterielRequirementFormState, MaterielTypeOption, RecurrenceFormState, INITIAL_RECURRENCE_FORM } from '@/components/missions/mission-form';
import { AdminBanner, AdminCard, AdminPageHeader } from '@/components/admin/ui';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';
import { getEventTemplateById } from '@/lib/event-templates';

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

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function generateRecurrenceDates(startDateStr: string, recurrence: RecurrenceFormState): string[] {
  if (!recurrence.enabled || !recurrence.end_date || recurrence.end_date < startDateStr) {
    return [startDateStr];
  }

  const dates: string[] = [];
  const endDate = parseLocalDate(recurrence.end_date);

  if (recurrence.frequency === 'daily') {
    const current = parseLocalDate(startDateStr);
    while (current <= endDate) {
      dates.push(toDateStr(current));
      current.setDate(current.getDate() + 1);
    }
  } else if (recurrence.frequency === 'weekly') {
    if (recurrence.days_of_week.length === 0) return [startDateStr];
    const current = parseLocalDate(startDateStr);
    while (current <= endDate) {
      if (recurrence.days_of_week.includes(current.getDay())) {
        dates.push(toDateStr(current));
      }
      current.setDate(current.getDate() + 1);
    }
  } else if (recurrence.frequency === 'monthly') {
    const current = parseLocalDate(startDateStr);
    while (current <= endDate) {
      dates.push(toDateStr(current));
      current.setMonth(current.getMonth() + 1);
    }
  }

  return dates.length > 0 ? dates : [startDateStr];
}

function isPositiveInteger(value: string) {
  return /^[1-9]\d*$/.test(value);
}

function normalizeSkillName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

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

export default function AdminCreateMissionPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<MissionFormState>(INITIAL_MISSION_FORM);
  const [recurrence, setRecurrence] = useState<RecurrenceFormState>(INITIAL_RECURRENCE_FORM);
  const [requirements, setRequirements] = useState<MissionRequirementFormState[]>([]);
  const [skills, setSkills] = useState<MissionSkillOption[]>([]);
  const [materielRequirements, setMaterielRequirements] = useState<MissionMaterielRequirementFormState[]>([]);
  const [materielTypes, setMaterielTypes] = useState<MaterielTypeOption[]>([]);
  const [missionTypes, setMissionTypes] = useState<MissionTypeOption[]>([]);
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);
  const [materielRequirementsError, setMaterielRequirementsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const router = useRouter();
  const hasInitializedTemplate = useRef(false);

  useEffect(() => {
    async function loadProfile() {
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

      setProfile(profileData);

      // Independent reads run in parallel to avoid a request waterfall.
      const [sessionResult, skillResult, materielResult, locationsResult] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from('skills').select('id,name,skill_categories(color)').order('name', { ascending: true }),
        supabase.from('materiel_categories').select('id,name,color').order('display_order', { ascending: true }),
        supabase.from('missions').select('location').not('location', 'is', null),
      ]);

      const tok = sessionResult.data.session?.access_token ?? '';
      const typesRes = await fetch('/api/mission-types', { headers: { Authorization: `Bearer ${tok}` } });
      if (typesRes.ok) {
        const typesJson = (await typesRes.json()) as { missionTypes: MissionTypeOption[] };
        setMissionTypes(typesJson.missionTypes);
        if (typesJson.missionTypes.length > 0 && !INITIAL_MISSION_FORM.mission_type_id) {
          setForm((prev) => ({ ...prev, mission_type_id: typesJson.missionTypes[0].id }));
        }
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
    }

    void loadProfile();
  }, [router]);

  useEffect(() => {
    if (hasInitializedTemplate.current) {
      return;
    }

    const template = getEventTemplateById(new URLSearchParams(window.location.search).get('template'));
    const hasRequirementsToMap = Boolean(template?.requirementDefaults && template.requirementDefaults.length > 0);

    if (hasRequirementsToMap && skills.length === 0) {
      return;
    }

    if (template) {
      setForm((previousForm) => ({
        ...previousForm,
        ...template.defaults
      }));

      if (hasRequirementsToMap) {
        setRequirements(
          template!.requirementDefaults!.map((requirement) => ({
            skill_id: requirement.skillName
              ? (skills.find((skill) => normalizeSkillName(skill.name ?? '') === normalizeSkillName(requirement.skillName!))?.id ?? '')
              : '',
            quantity: requirement.quantity
          }))
        );
      }
    }

    hasInitializedTemplate.current = true;
  }, [skills]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRequirementsError(null);
    setMaterielRequirementsError(null);
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

    if (recurrence.enabled) {
      if (!recurrence.end_date) {
        setError('La date de fin de récurrence est obligatoire.');
        return;
      }
      if (recurrence.end_date < form.starts_at_date) {
        setError('La date de fin de récurrence doit être postérieure à la date de début.');
        return;
      }
      if (recurrence.frequency === 'weekly' && recurrence.days_of_week.length === 0) {
        setError('Veuillez sélectionner au moins un jour de la semaine.');
        return;
      }
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

    const durationMs = new Date(endsAtIso).getTime() - new Date(startsAtIso).getTime();
    const dates = generateRecurrenceDates(form.starts_at_date, recurrence);

    if (dates.length > 100) {
      setError('La récurrence génèrerait plus de 100 missions. Veuillez réduire la période ou changer la fréquence.');
      setSubmitting(false);
      return;
    }

    const missionBase = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      mission_type_id: form.mission_type_id,
      required_volunteers: Number.parseInt(form.required_volunteers, 10),
      status: form.status,
      created_by: profile.id
    };

    const createdMissions: Array<{ id: string }> = [];

    for (const date of dates) {
      const newStart = new Date(`${date}T${form.starts_at_time}`);
      const newEnd = new Date(newStart.getTime() + durationMs);

      const { data: created, error: insertError } = await supabase
        .from('missions')
        .insert({
          ...missionBase,
          starts_at: newStart.toISOString(),
          ends_at: newEnd.toISOString()
        })
        .select('id')
        .single();

      if (insertError) {
        const insertedIds = createdMissions.map((m) => m.id);
        if (insertedIds.length > 0) {
          await supabase.from('missions').delete().in('id', insertedIds);
        }
        if (insertError.message.toLowerCase().includes('row-level security')) {
          setError("Action refusée par la politique d'accès (RLS). Vérifiez que votre profil est admin.");
        } else {
          setError(insertError.message);
        }
        setSubmitting(false);
        return;
      }

      createdMissions.push(created);
    }

    if (parsedRequirements.length > 0 && createdMissions.length > 0) {
      const requirementRows = createdMissions.flatMap((mission) =>
        parsedRequirements.map((requirement) => ({
          mission_id: mission.id,
          skill_id: requirement.skill_id,
          quantity: requirement.quantity
        }))
      );

      const { error: requirementInsertError } = await supabase.from('mission_required_skills').insert(requirementRows);

      if (requirementInsertError) {
        const missionIds = createdMissions.map((m) => m.id);
        await supabase.from('missions').delete().in('id', missionIds);
        setError(`Missions non enregistrées: impossible de créer les besoins en compétences (${requirementInsertError.message}).`);
        setSubmitting(false);
        return;
      }
    }

    if (parsedMaterielRequirements.length > 0 && createdMissions.length > 0) {
      const materielRequirementRows = createdMissions.flatMap((mission) =>
        parsedMaterielRequirements.map((requirement) => ({
          mission_id: mission.id,
          category_id: requirement.category_id,
          quantity: requirement.quantity
        }))
      );

      const { error: materielRequirementInsertError } = await supabase.from('mission_required_materiels').insert(materielRequirementRows);

      if (materielRequirementInsertError) {
        const missionIds = createdMissions.map((m) => m.id);
        await supabase.from('missions').delete().in('id', missionIds);
        setError(`Missions non enregistrées: impossible de créer le matériel requis (${materielRequirementInsertError.message}).`);
        setSubmitting(false);
        return;
      }
    }

    const count = createdMissions?.length ?? 0;
    const successMsg = count > 1
      ? `${count} missions créées avec succès. Redirection en cours...`
      : 'Mission créée avec succès. Redirection en cours...';

    setSuccess(successMsg);
    setForm(INITIAL_MISSION_FORM);
    setRecurrence(INITIAL_RECURRENCE_FORM);
    setRequirements([]);
    setMaterielRequirements([]);

    const firstId = createdMissions?.[0]?.id;
    window.setTimeout(() => {
      if (count === 1 && firstId) {
        router.push(`/missions/${firstId}`);
        return;
      }
      router.push('/missions');
    }, 600);
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

  return (
    <div style={{ paddingBottom: 40 }}>
      <AdminPageHeader
        title="Créer une mission"
        subtitle="Renseignez les informations de la mission. Vous pouvez aussi définir les besoins en bénévoles et une récurrence."
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
        recurrence={recurrence}
        onRecurrenceChange={setRecurrence}
        onSubmit={handleSubmit}
        submitting={submitting}
          submitLabel="Créer la mission"
          submittingLabel="Création..."
          createdByLabel={profile.full_name ? `${profile.full_name} (${profile.email})` : profile.email}
          />
        </AdminCard>
      </div>
    </div>
  );
}
