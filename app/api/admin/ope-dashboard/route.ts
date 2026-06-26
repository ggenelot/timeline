import { NextRequest, NextResponse } from 'next/server';
import { authorizeOpe } from '@/lib/api/ope-auth';
import type { MissionStatus, OpeAvailabilityEntry, OpeMission, OpeSkill, OpeTeamMember } from '@/lib/types';

// Les assignments retenus pour l'équipe « engagée ».
const ENGAGED_STATUSES = ['selected', 'confirmed'];

// ── Formes brutes des résultats Supabase (client non typé) ────────
type SkillEmbed = { id: string; name: string; category_id: string | null };
type SkillRel = SkillEmbed | SkillEmbed[] | null;
type VolunteerEmbed = { id: string; full_name: string | null; profile_skills: Array<{ status: string | null; skill: SkillRel }> | null };
type VolunteerRel = VolunteerEmbed | VolunteerEmbed[] | null;

type MissionRow = {
  id: string;
  title: string;
  description: string | null;
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
  mission_required_skill_id: string | null;
  volunteer: VolunteerRel;
};

type ProposalRow = {
  mission_id: string;
  volunteer_id: string;
  volunteer: VolunteerRel;
};

export async function GET(req: NextRequest) {
  const { client, error } = await authorizeOpe(req);
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
      'id,title,description,location,starts_at,ends_at,status,required_volunteers,mission_type_id,' +
        'mission_required_skills(id,quantity,skill:skills(id,name,category_id))'
    )
    .neq('status', 'cancelled')
    .gte('starts_at', from.toISOString())
    .lt('starts_at', to.toISOString())
    .order('starts_at', { ascending: true });
  if (missionsRes.error) return NextResponse.json({ error: missionsRes.error.message }, { status: 500 });
  const missionRows = (missionsRes.data ?? []) as unknown as MissionRow[];

  // Requêtes de référence en parallèle : types, catégories (couleurs), statuts validants, annuaire.
  const [typesRes, categoriesRes, validatingRes, volunteersRes] = await Promise.all([
    client!.from('mission_types').select('id,name,color'),
    client!.from('skill_categories').select('id,color'),
    client!.from('skill_statuses').select('key').eq('is_validating', true),
    client!.from('profiles').select('id,full_name').order('full_name', { ascending: true }),
  ]);
  if (typesRes.error) return NextResponse.json({ error: typesRes.error.message }, { status: 500 });
  if (categoriesRes.error) return NextResponse.json({ error: categoriesRes.error.message }, { status: 500 });
  if (validatingRes.error) return NextResponse.json({ error: validatingRes.error.message }, { status: 500 });
  if (volunteersRes.error) return NextResponse.json({ error: volunteersRes.error.message }, { status: 500 });

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

  // Compétences validées d'un volontaire embarqué (filtre is_validating).
  const validatedSkillsOf = (volunteer: VolunteerEmbed | undefined): OpeSkill[] =>
    (volunteer?.profile_skills ?? [])
      .filter((ps) => ps.status && validatingKeys.has(ps.status))
      .map((ps) => toOpeSkill(ps.skill))
      .filter((s): s is OpeSkill => s !== null);

  // Map required_skill.id → compétence (pour le rôle tenu sur le dispositif).
  const skillByRequiredId = new Map<string, SkillRel>();
  for (const m of missionRows) {
    for (const rs of m.mission_required_skills ?? []) skillByRequiredId.set(rs.id, rs.skill);
  }

  // 2) Équipe engagée + 3) disponibilités, sur les missions de la fenêtre.
  const missionIds = missionRows.map((m) => m.id);
  const teamByMission = new Map<string, OpeTeamMember[]>();
  const availability: OpeAvailabilityEntry[] = [];
  if (missionIds.length > 0) {
    // Embed volontaire (identique pour assignments & proposals).
    const volunteerEmbed =
      'volunteer:profiles!%FK%(id,full_name,profile_skills(status,skill:skills(id,name,category_id)))';
    const assignmentEmbed = volunteerEmbed.replace('%FK%', 'mission_assignments_volunteer_id_fkey');

    const assignmentsQuery = (withSkillRef: boolean) =>
      client!
        .from('mission_assignments')
        .select(
          `mission_id,volunteer_id,assignment_status,${withSkillRef ? 'mission_required_skill_id,' : ''}${assignmentEmbed}`
        )
        .in('mission_id', missionIds)
        .in('assignment_status', ENGAGED_STATUSES);

    const [assignmentsInitial, proposalsRes] = await Promise.all([
      assignmentsQuery(true),
      client!
        .from('mission_proposals')
        .select(
          `mission_id,volunteer_id,${volunteerEmbed.replace('%FK%', 'mission_proposals_volunteer_id_fkey')}`
        )
        .in('mission_id', missionIds)
        .eq('response', 'available'),
    ]);

    // Fallback : certaines bases n'ont pas encore la colonne mission_required_skill_id
    // (migration 20260430201000). On rejoue sans elle, comme la page détail mission.
    let assignmentsRes = assignmentsInitial;
    let supportsRequiredSkill = true;
    if (assignmentsRes.error?.message.includes('mission_assignments.mission_required_skill_id')) {
      supportsRequiredSkill = false;
      assignmentsRes = await assignmentsQuery(false);
    }
    if (assignmentsRes.error) return NextResponse.json({ error: assignmentsRes.error.message }, { status: 500 });
    if (proposalsRes.error) return NextResponse.json({ error: proposalsRes.error.message }, { status: 500 });

    for (const row of (assignmentsRes.data ?? []) as unknown as AssignmentRow[]) {
      const volunteer = Array.isArray(row.volunteer) ? row.volunteer[0] : row.volunteer ?? undefined;
      const assignedSkill =
        supportsRequiredSkill && row.mission_required_skill_id
          ? toOpeSkill(skillByRequiredId.get(row.mission_required_skill_id) ?? null)
          : null;

      const member: OpeTeamMember = {
        volunteer_id: row.volunteer_id,
        full_name: volunteer?.full_name ?? null,
        assignment_status: row.assignment_status,
        assignedSkill,
        validatedSkills: validatedSkillsOf(volunteer),
      };
      const list = teamByMission.get(row.mission_id) ?? [];
      list.push(member);
      teamByMission.set(row.mission_id, list);
    }

    for (const row of (proposalsRes.data ?? []) as unknown as ProposalRow[]) {
      const volunteer = Array.isArray(row.volunteer) ? row.volunteer[0] : row.volunteer ?? undefined;
      availability.push({
        mission_id: row.mission_id,
        volunteer_id: row.volunteer_id,
        full_name: volunteer?.full_name ?? null,
        validatedSkills: validatedSkillsOf(volunteer),
      });
    }
  }

  const missions: OpeMission[] = missionRows.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
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

  const volunteers = (volunteersRes.data ?? []).map((v) => ({ id: v.id, full_name: v.full_name }));

  return NextResponse.json({ from: from.toISOString(), days, missions, availability, volunteers });
}
