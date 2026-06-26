import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseAnonClient,
  createServerSupabaseServiceClient,
} from '@/lib/supabase/server';
import type { MissionStatus, OpeMission, OpeSkill, OpeTeamMember } from '@/lib/types';

function getToken(req: NextRequest): string {
  const auth = req.headers.get('authorization') ?? '';
  return auth.replace(/^Bearer\s+/i, '').trim();
}

// Accès OPE : rôle global `admin`/`responsable` OU comportement `can_manage`
// sur la ressource `mission` (système de rôles fin).
async function authorize(req: NextRequest) {
  const token = getToken(req);
  if (!token) {
    return { client: null, error: NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }) };
  }

  const anonClient = createServerSupabaseAnonClient(token);
  const {
    data: { user },
    error: userError,
  } = await anonClient.auth.getUser(token);
  if (userError || !user) {
    return { client: null, error: NextResponse.json({ error: 'Session invalide.' }, { status: 401 }) };
  }

  const serviceClient = createServerSupabaseServiceClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'admin' || profile?.role === 'responsable') {
    return { client: serviceClient, error: null };
  }

  const { data: canManage } = await serviceClient.rpc('has_role_behavior', {
    _user_id: user.id,
    _resource_type: 'mission',
    _behavior: 'can_manage',
  });

  if (!canManage) {
    return { client: null, error: NextResponse.json({ error: 'Non autorisé.' }, { status: 403 }) };
  }

  return { client: serviceClient, error: null };
}

// Les assignments retenus pour l'équipe « engagée ».
const ENGAGED_STATUSES = ['selected', 'confirmed'];

// ── Formes brutes des résultats Supabase (client non typé) ────────
type SkillEmbed = { id: string; name: string; category_id: string | null };
type SkillRel = SkillEmbed | SkillEmbed[] | null;

type MissionRow = {
  id: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string;
  status: MissionStatus;
  required_volunteers: number;
  mission_type_id: string;
  mission_required_skills: Array<{ id: string; quantity: number; skill: SkillRel }> | null;
};

type AssignmentRow = {
  mission_id: string;
  volunteer_id: string;
  assignment_status: string;
  volunteer:
    | { id: string; full_name: string | null; profile_skills: Array<{ status: string | null; skill: SkillRel }> | null }
    | { id: string; full_name: string | null; profile_skills: Array<{ status: string | null; skill: SkillRel }> | null }[]
    | null;
};

export async function GET(req: NextRequest) {
  const { client, error } = await authorize(req);
  if (error) return error;

  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const daysParam = Number.parseInt(url.searchParams.get('days') ?? '', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 31 ? daysParam : 7;

  // Fenêtre [from 00:00, from+days 00:00[
  const from = fromParam ? new Date(fromParam) : new Date();
  if (Number.isNaN(from.getTime())) {
    return NextResponse.json({ error: 'Paramètre `from` invalide.' }, { status: 400 });
  }
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(from.getDate() + days);

  // 1) Missions de la fenêtre (hors annulées) + besoins en compétences.
  const missionsRes = await client!
    .from('missions')
    .select(
      'id,title,location,starts_at,ends_at,status,required_volunteers,mission_type_id,' +
        'mission_required_skills(id,quantity,skill:skills(id,name,category_id))'
    )
    .neq('status', 'cancelled')
    .gte('starts_at', from.toISOString())
    .lt('starts_at', to.toISOString())
    .order('starts_at', { ascending: true });
  if (missionsRes.error) return NextResponse.json({ error: missionsRes.error.message }, { status: 500 });
  const missionRows = (missionsRes.data ?? []) as unknown as MissionRow[];

  // Requêtes de référence en parallèle : types, catégories (couleurs), statuts validants.
  const [typesRes, categoriesRes, validatingRes] = await Promise.all([
    client!.from('mission_types').select('id,name,color'),
    client!.from('skill_categories').select('id,color'),
    client!.from('skill_statuses').select('key').eq('is_validating', true),
  ]);
  if (typesRes.error) return NextResponse.json({ error: typesRes.error.message }, { status: 500 });
  if (categoriesRes.error) return NextResponse.json({ error: categoriesRes.error.message }, { status: 500 });
  if (validatingRes.error) return NextResponse.json({ error: validatingRes.error.message }, { status: 500 });

  const typeById = new Map<string, { name: string | null; color: string | null }>(
    (typesRes.data ?? []).map((t) => [t.id, { name: t.name, color: t.color }])
  );
  const colorByCategory = new Map<string, string | null>(
    (categoriesRes.data ?? []).map((c) => [c.id, c.color])
  );
  const validatingKeys = new Set((validatingRes.data ?? []).map((s) => s.key));

  // Résout une compétence brute (skills row) en OpeSkill avec couleur de catégorie.
  const toOpeSkill = (skill: SkillRel): OpeSkill | null => {
    const s = Array.isArray(skill) ? skill[0] : skill;
    if (!s) return null;
    return { id: s.id, name: s.name, color: s.category_id ? colorByCategory.get(s.category_id) ?? null : null };
  };

  // 2) Équipe engagée : assignments retenus + compétences validées du bénévole.
  const missionIds = missionRows.map((m) => m.id);
  const teamByMission = new Map<string, OpeTeamMember[]>();
  if (missionIds.length > 0) {
    const assignmentsRes = await client!
      .from('mission_assignments')
      .select(
        'mission_id,volunteer_id,assignment_status,' +
          'volunteer:profiles!mission_assignments_volunteer_id_fkey(' +
          'id,full_name,profile_skills(status,skill:skills(id,name,category_id)))'
      )
      .in('mission_id', missionIds)
      .in('assignment_status', ENGAGED_STATUSES);
    if (assignmentsRes.error) return NextResponse.json({ error: assignmentsRes.error.message }, { status: 500 });

    for (const row of (assignmentsRes.data ?? []) as unknown as AssignmentRow[]) {
      const volunteer = Array.isArray(row.volunteer) ? row.volunteer[0] : row.volunteer;
      const validatedSkills = (volunteer?.profile_skills ?? [])
        .filter((ps) => ps.status && validatingKeys.has(ps.status))
        .map((ps) => toOpeSkill(ps.skill))
        .filter((s): s is OpeSkill => s !== null);

      const member: OpeTeamMember = {
        volunteer_id: row.volunteer_id,
        full_name: volunteer?.full_name ?? null,
        assignment_status: row.assignment_status,
        validatedSkills,
      };
      const list = teamByMission.get(row.mission_id) ?? [];
      list.push(member);
      teamByMission.set(row.mission_id, list);
    }
  }

  const missions: OpeMission[] = missionRows.map((m) => ({
    id: m.id,
    title: m.title,
    location: m.location,
    starts_at: m.starts_at,
    ends_at: m.ends_at,
    status: m.status,
    required_volunteers: m.required_volunteers,
    type: typeById.get(m.mission_type_id) ?? { name: null, color: null },
    requiredSkills: (m.mission_required_skills ?? []).map((rs) => ({
      id: rs.id,
      quantity: rs.quantity,
      skill: toOpeSkill(rs.skill),
    })),
    team: teamByMission.get(m.id) ?? [],
  }));

  return NextResponse.json({ from: from.toISOString(), days, missions });
}
