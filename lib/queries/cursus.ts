import { supabase } from '@/lib/supabase/client';
import type {
  Cursus,
  CursusRule,
  CursusPhase,
  CursusCompetence,
  VolunteerCursus,
  Doublure,
  DoublureNote,
  DoublureNoteKind,
  CompetenceValidation,
  SupervisedDoublure,
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

export async function getDoublure(id: string): Promise<Doublure> {
  const { data, error } = await supabase.from('doublures').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getPhaseCompetences(phaseId: string): Promise<CursusCompetence[]> {
  const { data, error } = await supabase
    .from('cursus_competences')
    .select('*')
    .eq('phase_id', phaseId)
    .order('order_idx');
  if (error) throw error;
  return data ?? [];
}

// La RLS ne renvoie que les notes que l'utilisateur a le droit de voir.
export async function getDoublureNotes(doublureIds: string[]): Promise<DoublureNote[]> {
  if (doublureIds.length === 0) return [];
  const { data, error } = await supabase
    .from('doublure_notes')
    .select('*')
    .in('doublure_id', doublureIds);
  if (error) throw error;
  return data ?? [];
}

export async function listSupervisedDoublures(): Promise<SupervisedDoublure[]> {
  const { data, error } = await supabase.rpc('list_supervised_doublures');
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

export async function updateDoublure(
  id: string,
  patch: Partial<Omit<Doublure, 'id' | 'created_at' | 'volunteer_cursus_id' | 'declared_by'>>
): Promise<Doublure> {
  const { data, error } = await supabase
    .from('doublures')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// Une note vide est supprimée plutôt que stockée.
export async function saveDoublureNote(
  doublureId: string,
  kind: DoublureNoteKind,
  body: string
): Promise<DoublureNote | null> {
  if (!body.trim()) {
    const { error } = await supabase
      .from('doublure_notes')
      .delete()
      .eq('doublure_id', doublureId)
      .eq('kind', kind);
    if (error) throw error;
    return null;
  }
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('doublure_notes')
    .upsert(
      { doublure_id: doublureId, kind, body, updated_by: user?.id ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'doublure_id,kind' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// Notification Slack du doubleur : ne bloque jamais l'enregistrement, un
// échec (Slack non configuré, compte non lié…) est simplement ignoré.
export async function notifyDoublureSupervisor(doublureId: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`/api/doublures/${encodeURIComponent(doublureId)}/notify-supervisor`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    /* best-effort */
  }
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

export async function updateCompetenceValidation(
  id: string,
  patch: Partial<Omit<CompetenceValidation, 'id' | 'volunteer_cursus_id' | 'competence_id' | 'declared_by' | 'validated_at'>>
): Promise<CompetenceValidation> {
  const { data, error } = await supabase
    .from('competence_validations')
    .update(patch)
    .eq('id', id)
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
  const results = await Promise.all(
    rules.map((r) =>
      supabase.from('cursus_rules').update({ order_idx: r.order_idx }).eq('id', r.id)
    )
  );
  const failure = results.find((res) => res.error);
  if (failure?.error) throw failure.error;
}

export async function reorderCursusCompetences(
  competences: Array<{ id: string; order_idx: number }>
): Promise<void> {
  const results = await Promise.all(
    competences.map((c) =>
      supabase.from('cursus_competences').update({ order_idx: c.order_idx }).eq('id', c.id)
    )
  );
  const failure = results.find((res) => res.error);
  if (failure?.error) throw failure.error;
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
  payload: Partial<CursusPhase> & { cursus_id: string; label: string }
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

export async function deleteCursusPhase(id: string): Promise<void> {
  const { error } = await supabase.from('cursus_phases').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderCursusPhases(
  phases: Array<{ id: string; order_idx: number }>
): Promise<void> {
  const results = await Promise.all(
    phases.map((p) =>
      supabase.from('cursus_phases').update({ order_idx: p.order_idx }).eq('id', p.id)
    )
  );
  const failure = results.find((res) => res.error);
  if (failure?.error) throw failure.error;
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
