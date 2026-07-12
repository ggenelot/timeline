import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';
import type { PermissionAction } from '@/lib/types';

// Le tableau de bord compétences suit la ressource `cursus` : lecture avec
// can_see (supervision), écriture avec can_manage. L'admin passe implicitement
// via has_permission.
async function authorize(req: NextRequest, action: PermissionAction) {
  const auth = await requirePermission(req, 'cursus', action);
  if (auth.errorResponse) return { client: null, error: auth.errorResponse };
  return { client: auth.serviceClient, error: null };
}

export async function GET(req: NextRequest) {
  const { client, error } = await authorize(req, 'can_see');
  if (error) return error;

  const [
    categoriesRes,
    profilesRes,
    profileSkillsRes,
    cursusRes,
    statusesRes,
    volunteerCursusRes,
    competenceValidationsRes,
    cursusPhasesRes,
    doubluresRes,
  ] = await Promise.all([
    client!
      .from('skill_categories')
      .select('id,name,color,display_order,skills(id,name,code,level,category_id,display_order)')
      .order('display_order', { ascending: true })
      .order('display_order', { referencedTable: 'skills', ascending: true }),
    client!
      .from('profiles')
      .select('id,full_name,email,sector,role,avatar_url')
      .order('full_name', { ascending: true }),
    client!.from('profile_skills').select('profile_id,skill_id,status'),
    client!.from('cursus').select('id,code,name,category,level,skill_id').order('level', { ascending: true }),
    client!.from('skill_statuses').select('*').order('display_order', { ascending: true }),
    client!.from('volunteer_cursus').select('id,profile_id,cursus_id,completed_at'),
    client!
      .from('competence_validations')
      .select(
        'id,volunteer_cursus_id,competence_id,doublure_id,event_name,event_date,event_lieu,supervisor_name,supervisor_antenne,validated_at,competence:cursus_competences(name,phase_id)'
      )
      .order('validated_at', { ascending: false }),
    client!.from('cursus_phases').select('id,cursus_id,label'),
    client!.from('doublures').select('id,message,supervisor_comment,is_external,is_pending'),
  ]);

  if (categoriesRes.error) return NextResponse.json({ error: categoriesRes.error.message }, { status: 500 });
  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  if (profileSkillsRes.error) return NextResponse.json({ error: profileSkillsRes.error.message }, { status: 500 });
  if (cursusRes.error) return NextResponse.json({ error: cursusRes.error.message }, { status: 500 });
  if (statusesRes.error) return NextResponse.json({ error: statusesRes.error.message }, { status: 500 });
  if (volunteerCursusRes.error) return NextResponse.json({ error: volunteerCursusRes.error.message }, { status: 500 });
  if (competenceValidationsRes.error) return NextResponse.json({ error: competenceValidationsRes.error.message }, { status: 500 });
  if (cursusPhasesRes.error) return NextResponse.json({ error: cursusPhasesRes.error.message }, { status: 500 });
  if (doubluresRes.error) return NextResponse.json({ error: doubluresRes.error.message }, { status: 500 });

  // Map skill_id -> cursus (pour rendre les chips cliquables vers le carnet).
  const cursusBySkill: Record<string, { id: string; code: string; name: string }> = {};
  for (const c of cursusRes.data ?? []) {
    if (c.skill_id) cursusBySkill[c.skill_id] = { id: c.id, code: c.code, name: c.name };
  }

  // volunteer_cursus_id -> { profile_id, cursus_id } pour aplatir les
  // validations sans avoir à imbriquer plusieurs niveaux de jointure.
  const vcById: Record<string, { profile_id: string; cursus_id: string }> = {};
  for (const vc of volunteerCursusRes.data ?? []) {
    vcById[vc.id] = { profile_id: vc.profile_id, cursus_id: vc.cursus_id };
  }

  const phaseLabelById: Record<string, string> = {};
  for (const ph of cursusPhasesRes.data ?? []) {
    phaseLabelById[ph.id] = ph.label;
  }

  // message / supervisor_comment ne sont portés que par `doublures`, pas par
  // `competence_validations` : on les rattache via doublure_id quand présent.
  const doublureById: Record<
    string,
    { message: string | null; supervisor_comment: string | null; is_external: boolean; is_pending: boolean }
  > = {};
  for (const d of doubluresRes.data ?? []) {
    doublureById[d.id] = {
      message: d.message,
      supervisor_comment: d.supervisor_comment,
      is_external: d.is_external,
      is_pending: d.is_pending,
    };
  }

  const competenceEvents = (competenceValidationsRes.data ?? [])
    .map((cv) => {
      const vc = vcById[cv.volunteer_cursus_id];
      if (!vc) return null;
      const competence = cv.competence as unknown as { name: string; phase_id: string | null } | null;
      const doublure = cv.doublure_id ? doublureById[cv.doublure_id] : undefined;
      return {
        id: cv.id,
        profile_id: vc.profile_id,
        cursus_id: vc.cursus_id,
        volunteer_cursus_id: cv.volunteer_cursus_id,
        competence_id: cv.competence_id,
        competence_name: competence?.name ?? '—',
        phase_name: (competence?.phase_id && phaseLabelById[competence.phase_id]) || null,
        doublure_id: cv.doublure_id,
        event_name: cv.event_name,
        event_date: cv.event_date,
        event_lieu: cv.event_lieu,
        supervisor_name: cv.supervisor_name,
        supervisor_antenne: cv.supervisor_antenne,
        message: doublure?.message ?? null,
        supervisor_comment: doublure?.supervisor_comment ?? null,
        is_external: doublure?.is_external ?? false,
        is_pending: doublure?.is_pending ?? false,
        validated_at: cv.validated_at,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return NextResponse.json({
    categories: categoriesRes.data ?? [],
    profiles: profilesRes.data ?? [],
    profileSkills: profileSkillsRes.data ?? [],
    cursusBySkill,
    allCursus: cursusRes.data ?? [],
    enrolledCursus: (volunteerCursusRes.data ?? []).map((vc) => ({
      profile_id: vc.profile_id,
      cursus_id: vc.cursus_id,
      completed_at: vc.completed_at,
    })),
    statuses: statusesRes.data ?? [],
    competenceEvents,
  });
}

export async function POST(req: NextRequest) {
  const { client, error } = await authorize(req, 'can_manage');
  if (error) return error;

  const body = (await req.json()) as {
    profile_id?: string;
    skill_id?: string;
    status?: string;
    action?: string;
    cursus_id?: string;
  };
  const { profile_id, skill_id, status, action, cursus_id } = body;

  if (action === 'enroll') {
    if (!profile_id || !cursus_id) {
      return NextResponse.json({ error: 'profile_id et cursus_id sont requis.' }, { status: 400 });
    }
    const { data: vc, error: enrollError } = await client!
      .from('volunteer_cursus')
      .insert({ profile_id, cursus_id })
      .select('*')
      .single();
    if (enrollError) return NextResponse.json({ error: enrollError.message }, { status: 500 });
    return NextResponse.json({ ok: true, volunteerCursus: vc });
  }

  if (!profile_id || !skill_id) {
    return NextResponse.json({ error: 'profile_id et skill_id sont requis.' }, { status: 400 });
  }

  // "Non acquise" => suppression de la ligne.
  if (!status || status === 'none') {
    const { error: delError } = await client!
      .from('profile_skills')
      .delete()
      .eq('profile_id', profile_id)
      .eq('skill_id', skill_id);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: null });
  }

  const { data: statusRow } = await client!.from('skill_statuses').select('key').eq('key', status).single();
  if (!statusRow) {
    return NextResponse.json({ error: 'Statut invalide.' }, { status: 400 });
  }

  const { error: upsertError } = await client!
    .from('profile_skills')
    .upsert(
      { profile_id, skill_id, status },
      { onConflict: 'profile_id,skill_id' }
    );
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({ ok: true, status });
}
