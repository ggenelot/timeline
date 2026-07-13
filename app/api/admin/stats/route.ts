import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';

type Period = '7d' | '30d' | '90d' | 'all';

function getPeriodCutoff(period: Period): Date | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function assertAdminOrResponsable(req: NextRequest) {
  const auth = await requirePermission(req, 'mission', 'can_manage');
  if (auth.errorResponse) return { client: null, error: auth.errorResponse };
  return { client: auth.serviceClient, error: null };
}

type MissionRef = { starts_at: string | null } | null;

function getMissionStartsAt(mission: MissionRef | MissionRef[]): string | null {
  const m = Array.isArray(mission) ? mission[0] : mission;
  return m?.starts_at ?? null;
}

function isInPeriod(startsAt: string | null, cutoff: Date | null): boolean {
  if (!cutoff) return true;
  if (!startsAt) return false;
  return new Date(startsAt) >= cutoff;
}

export async function GET(req: NextRequest) {
  const { client, error } = await assertAdminOrResponsable(req);
  if (error) return error;

  const raw = req.nextUrl.searchParams.get('period') ?? 'all';
  const period: Period = ['7d', '30d', '90d', 'all'].includes(raw) ? (raw as Period) : 'all';
  const cutoff = getPeriodCutoff(period);

  const [volunteersRes, proposalsRes, assignmentsRes] = await Promise.all([
    client!.from('profiles').select('id, full_name, identifier').eq('role', 'benevole').order('full_name'),
    client!.from('mission_proposals').select('volunteer_id, response, mission:missions(starts_at)'),
    client!.from('mission_assignments').select('volunteer_id, mission:missions(starts_at)').eq('assignment_status', 'confirmed'),
  ]);

  if (volunteersRes.error) return NextResponse.json({ error: volunteersRes.error.message }, { status: 500 });
  if (proposalsRes.error) return NextResponse.json({ error: proposalsRes.error.message }, { status: 500 });
  if (assignmentsRes.error) return NextResponse.json({ error: assignmentsRes.error.message }, { status: 500 });

  const volunteers = volunteersRes.data ?? [];
  const proposals = proposalsRes.data ?? [];
  const assignments = assignmentsRes.data ?? [];

  const byVolunteer = volunteers.map((volunteer) => {
    const volProposals = proposals.filter(
      (p) => p.volunteer_id === volunteer.id && isInPeriod(getMissionStartsAt(p.mission as MissionRef | MissionRef[]), cutoff)
    );
    const volConfirmed = assignments.filter(
      (a) => a.volunteer_id === volunteer.id && isInPeriod(getMissionStartsAt(a.mission as MissionRef | MissionRef[]), cutoff)
    );

    const total = volProposals.length;
    const responded = volProposals.filter((p) => p.response !== 'no_response').length;

    return {
      id: volunteer.id,
      full_name: volunteer.full_name,
      identifier: volunteer.identifier,
      proposals: total,
      responded,
      response_rate: total > 0 ? Math.round((responded / total) * 100) : null,
      available: volProposals.filter((p) => p.response === 'available').length,
      maybe: volProposals.filter((p) => p.response === 'maybe').length,
      unavailable: volProposals.filter((p) => p.response === 'unavailable').length,
      no_response: volProposals.filter((p) => p.response === 'no_response').length,
      confirmed: volConfirmed.length,
    };
  });

  byVolunteer.sort((a, b) => (b.response_rate ?? -1) - (a.response_rate ?? -1));

  const totalProposals = byVolunteer.reduce((s, v) => s + v.proposals, 0);
  const totalResponded = byVolunteer.reduce((s, v) => s + v.responded, 0);

  return NextResponse.json({
    global: {
      total_volunteers: volunteers.length,
      active_volunteers: byVolunteer.filter((v) => v.proposals > 0).length,
      total_proposals: totalProposals,
      response_rate: totalProposals > 0 ? Math.round((totalResponded / totalProposals) * 100) : null,
      total_confirmed: byVolunteer.reduce((s, v) => s + v.confirmed, 0),
    },
    by_volunteer: byVolunteer,
  });
}
