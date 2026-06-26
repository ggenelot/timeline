import { NextRequest, NextResponse } from 'next/server';
import { authorizeOpe } from '@/lib/api/ope-auth';
import type { MissionStatus, OpePersonActivity, OpeSkill } from '@/lib/types';

const ENGAGED_STATUSES = ['selected', 'confirmed'];

type SkillEmbed = { id: string; name: string; category_id: string | null };
type SkillRel = SkillEmbed | SkillEmbed[] | null;
type MissionEmbed = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: MissionStatus;
  mission_type_id: string;
  mission_required_skills: Array<{ id: string; skill: SkillRel }> | null;
};
type ActivityRow = {
  assignment_status: string;
  mission_required_skill_id: string | null;
  mission: MissionEmbed | MissionEmbed[] | null;
};

// Toutes les activités (engagements) d'un secouriste — pour la recherche par personne.
export async function GET(req: NextRequest) {
  const { client, error } = await authorizeOpe(req);
  if (error) return error;

  const volunteerId = new URL(req.url).searchParams.get('volunteer_id');
  if (!volunteerId) {
    return NextResponse.json({ error: 'Paramètre `volunteer_id` requis.' }, { status: 400 });
  }

  const assignmentsQuery = (withSkillRef: boolean) =>
    client!
      .from('mission_assignments')
      .select(
        `assignment_status,${withSkillRef ? 'mission_required_skill_id,' : ''}` +
          'mission:missions(id,title,starts_at,ends_at,status,mission_type_id,' +
          'mission_required_skills(id,skill:skills(id,name,category_id)))'
      )
      .eq('volunteer_id', volunteerId)
      .in('assignment_status', ENGAGED_STATUSES);

  const [assignmentsInitial, typesRes, categoriesRes] = await Promise.all([
    assignmentsQuery(true),
    client!.from('mission_types').select('id,name,color'),
    client!.from('skill_categories').select('id,color'),
  ]);

  // Fallback : base sans la colonne mission_required_skill_id (migration 20260430201000).
  let assignmentsRes = assignmentsInitial;
  let supportsRequiredSkill = true;
  if (assignmentsRes.error?.message.includes('mission_assignments.mission_required_skill_id')) {
    supportsRequiredSkill = false;
    assignmentsRes = await assignmentsQuery(false);
  }
  if (assignmentsRes.error) return NextResponse.json({ error: assignmentsRes.error.message }, { status: 500 });
  if (typesRes.error) return NextResponse.json({ error: typesRes.error.message }, { status: 500 });
  if (categoriesRes.error) return NextResponse.json({ error: categoriesRes.error.message }, { status: 500 });

  const typeById = new Map<string, { name: string | null; color: string | null }>(
    (typesRes.data ?? []).map((t) => [t.id, { name: t.name, color: t.color }])
  );
  const colorByCategory = new Map<string, string | null>(
    (categoriesRes.data ?? []).map((c) => [c.id, c.color])
  );
  const toOpeSkill = (skill: SkillRel): OpeSkill | null => {
    const s = Array.isArray(skill) ? skill[0] : skill;
    if (!s) return null;
    return { id: s.id, name: s.name, color: s.category_id ? colorByCategory.get(s.category_id) ?? null : null };
  };

  const activities: OpePersonActivity[] = [];
  for (const row of (assignmentsRes.data ?? []) as unknown as ActivityRow[]) {
    const mission = Array.isArray(row.mission) ? row.mission[0] : row.mission;
    if (!mission) continue;

    let assignedSkill: OpeSkill | null = null;
    if (supportsRequiredSkill && row.mission_required_skill_id) {
      const rs = (mission.mission_required_skills ?? []).find((r) => r.id === row.mission_required_skill_id);
      assignedSkill = rs ? toOpeSkill(rs.skill) : null;
    }

    activities.push({
      mission_id: mission.id,
      title: mission.title,
      starts_at: mission.starts_at,
      ends_at: mission.ends_at,
      status: mission.status,
      type: typeById.get(mission.mission_type_id) ?? { name: null, color: null },
      assignment_status: row.assignment_status,
      assignedSkill,
    });
  }

  // Plus récent d'abord (comparaison lexicographique sur ISO = chronologique).
  activities.sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  return NextResponse.json({ activities });
}
