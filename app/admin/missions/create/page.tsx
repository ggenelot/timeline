'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MissionForm, MissionFormState, INITIAL_MISSION_FORM, MissionRequirementFormState } from '@/components/missions/mission-form';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';
import { getEventTemplateById } from '@/lib/event-templates';

type MissionSkillOption = {
  id: string;
  name: string | null;
  category: 'formation' | 'operationnel' | 'conduite' | 'accso' | 'technique' | null;
};

type ParsedRequirement = {
  skill_id: string | null;
  quantity: number;
};

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

export default function AdminCreateMissionPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<MissionFormState>(INITIAL_MISSION_FORM);
  const [requirements, setRequirements] = useState<MissionRequirementFormState[]>([]);
  const [skills, setSkills] = useState<MissionSkillOption[]>([]);
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);
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
        .select('id,full_name,email,phone,role,sector,created_at')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profileData) {
        setError('Impossible de charger votre profil.');
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: skillData, error: skillError } = await supabase
        .from('skills')
        .select('id,name,category')
        .order('name', { ascending: true });

      if (skillError) {
        setError(`Impossible de charger les compétences: ${skillError.message}`);
        setLoading(false);
        return;
      }

      setSkills(skillData ?? []);

      const { data: locationsData, error: locationsError } = await supabase
        .from('missions')
        .select('location')
        .not('location', 'is', null);

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

    const { parsedRequirements, error: parsedRequirementsError } = parseMissionRequirements(requirements);

    if (parsedRequirementsError) {
      setRequirementsError(parsedRequirementsError);
      return;
    }

    setSubmitting(true);

    const { data: createdMission, error: insertError } = await supabase
      .from('missions')
      .insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        
        category: form.category,
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

    if ((createdMission?.id ?? null) && parsedRequirements.length > 0) {
      const { error: requirementInsertError } = await supabase.from('mission_required_skills').insert(
        parsedRequirements.map((requirement) => ({
          mission_id: createdMission.id,
          skill_id: requirement.skill_id,
          quantity: requirement.quantity
        }))
      );

      if (requirementInsertError) {
        await supabase.from('missions').delete().eq('id', createdMission.id);
        setError(`Mission non enregistrée: impossible de créer les besoins en compétences (${requirementInsertError.message}).`);
        setSubmitting(false);
        return;
      }
    }

    setSuccess('Mission créée avec succès. Redirection en cours...');
    setForm(INITIAL_MISSION_FORM);
    setRequirements([]);

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
        requirements={requirements}
        onRequirementsChange={setRequirements}
        requirementsError={requirementsError}
        availableSkills={skills.map((skill) => ({ id: skill.id, name: skill.name || 'Compétence sans nom', category: skill.category }))}
        locationSuggestions={locationSuggestions}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel="Créer la mission"
        submittingLabel="Création..."
        createdByLabel={profile.full_name ? `${profile.full_name} (${profile.email})` : profile.email}
      />
    </section>
  );
}
