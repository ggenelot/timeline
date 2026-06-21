import { supabase } from '@/lib/supabase/client';
import type {
  Cursus,
  CursusRule,
  CursusPhase,
  CursusCompetence,
  VolunteerCursus,
  Doublure,
  CompetenceValidation,
} from '@/lib/types';

// ── Read ─────────────────────────────────────────────────────

export async function getAllCursus(): Promise<Cursus[]> {
  const { data, error } = await supabase
    .from('cursus')
    .select('*')
    .order('level', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getCursusWithDetails(
  cursusId: string
): Promise<(Cursus & { rules: CursusRule[]; phases: CursusPhase[] }) | null> {
  const [cursusRes, rulesRes, phasesRes] = await Promise.all([
    supabase.from('cursus').select('*').eq('id', cursusId).single(),
    supabase
      .from('cursus_rules')
      .select('*')
      .eq('cursus_id', cursusId)
      .order('order_idx'),
    supabase
      .from('cursus_phases')
      .select('*, competences:cursus_competences(*)')
      .eq('cursus_id', cursusId)
      .order('order_idx'),
  ]);
  if (cursusRes.error) throw cursusRes.error;
  if (!cursusRes.data) return null;
  return {
    ...cursusRes.data,
    rules: rulesRes.data ?? [],
    phases: (phasesRes.data ?? []).map((p) => ({
      ...p,
      competences: (p.competences ?? []).sort(
        (a: CursusCompetence, b: CursusCompetence) => a.order_idx - b.order_idx
      ),
    })),
  };
}

export async function getVolunteerCursus(profileId: string): Promise<VolunteerCursus[]> {
  const { data, error } = await supabase
    .from('volunteer_cursus')
    .select('*, cursus(*)')
    .eq('profile_id', profileId)
    .order('enrolled_at');
  if (error) throw error;
  return data ?? [];
}

export async function getDoubluresForVolunteerCursus(
  volunteerCursusId: string
): Promise<Doublure[]> {
  const { data, error } = await supabase
    .from('doublures')
    .select('*')
    .eq('volunteer_cursus_id', volunteerCursusId)
    .order('event_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getValidationsForVolunteerCursus(
  volunteerCursusId: string
): Promise<CompetenceValidation[]> {
  const { data, error } = await supabase
    .from('competence_validations')
    .select('*')
    .eq('volunteer_cursus_id', volunteerCursusId);
  if (error) throw error;
  return data ?? [];
}

// ── Write ─────────────────────────────────────────────────────

export async function enrollInCursus(
  profileId: string,
  cursusId: string
): Promise<VolunteerCursus> {
  const { data, error } = await supabase
    .from('volunteer_cursus')
    .insert({ profile_id: profileId, cursus_id: cursusId })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function declareDoublure(
  payload: Omit<Doublure, 'id' | 'created_at'>
): Promise<Doublure> {
  const { data, error } = await supabase
    .from('doublures')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDoublure(id: string): Promise<void> {
  const { error } = await supabase.from('doublures').delete().eq('id', id);
  if (error) throw error;
}

export async function declareCompetenceValidation(
  payload: Omit<CompetenceValidation, 'id' | 'validated_at'>
): Promise<CompetenceValidation> {
  const { data, error } = await supabase
    .from('competence_validations')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCompetenceValidation(id: string): Promise<void> {
  const { error } = await supabase.from('competence_validations').delete().eq('id', id);
  if (error) throw error;
}

// ── Admin cursus config ───────────────────────────────────────

export async function upsertCursus(
  payload: Partial<Cursus> & { code: string; name: string }
): Promise<Cursus> {
  const { data, error } = await supabase
    .from('cursus')
    .upsert(payload, { onConflict: 'code' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCursus(id: string): Promise<void> {
  const { error } = await supabase.from('cursus').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderCursusRules(
  rules: Array<{ id: string; order_idx: number }>
): Promise<void> {
  await Promise.all(
    rules.map((r) =>
      supabase.from('cursus_rules').update({ order_idx: r.order_idx }).eq('id', r.id)
    )
  );
}

export async function reorderCursusCompetences(
  competences: Array<{ id: string; order_idx: number }>
): Promise<void> {
  await Promise.all(
    competences.map((c) =>
      supabase.from('cursus_competences').update({ order_idx: c.order_idx }).eq('id', c.id)
    )
  );
}

export async function upsertCursusRule(
  payload: Partial<CursusRule> & { cursus_id: string; text: string }
): Promise<CursusRule> {
  const { data, error } = await supabase
    .from('cursus_rules')
    .upsert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCursusRule(id: string): Promise<void> {
  const { error } = await supabase.from('cursus_rules').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertCursusPhase(
  payload: Partial<CursusPhase> & { cursus_id: string; kind: 'pre' | 'post'; label: string }
): Promise<CursusPhase> {
  const { competences: _c, ...rest } = payload as CursusPhase & {
    competences?: unknown;
  };
  const { data, error } = await supabase
    .from('cursus_phases')
    .upsert(rest)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function upsertCursusCompetence(
  payload: Partial<CursusCompetence> & { phase_id: string; name: string }
): Promise<CursusCompetence> {
  const { data, error } = await supabase
    .from('cursus_competences')
    .upsert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCursusCompetence(id: string): Promise<void> {
  const { error } = await supabase.from('cursus_competences').delete().eq('id', id);
  if (error) throw error;
}
