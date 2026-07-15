import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';
import { isEopeConfigured, resolveEopeConfig } from '@/lib/eope/config';

export const dynamic = 'force-dynamic';

const ENGAGED_STATUSES = ['selected', 'confirmed'];
const PUSH_MISSION_STATUSES = ['proposed', 'confirmed', 'closed'];

type AssignmentRow = {
  mission_id: string;
  volunteer_id: string;
  mission:
    | { id: string; title: string; eope_event_id: string | null; status: string }
    | Array<{ id: string; title: string; eope_event_id: string | null; status: string }>
    | null;
  volunteer:
    | { id: string; full_name: string | null; eope_user_id: string | null }
    | Array<{ id: string; full_name: string | null; eope_user_id: string | null }>
    | null;
};

function firstOf<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

// État de l'intégration eOPE pour la page /admin/integrations/eope : configuration,
// derniers runs, compteurs et bénévoles engagés non liés.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'settings', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const config = await resolveEopeConfig(auth.serviceClient);
  const configured = isEopeConfigured(config);

  const [{ data: runs }, { count: linkedMissionsCount }, { count: linkedVolunteersCount }, { data: assignmentRows }] =
    await Promise.all([
      auth.serviceClient
        .from('eope_sync_runs')
        .select('id, direction, trigger_source, status, started_at, finished_at, stats, errors')
        .order('started_at', { ascending: false })
        .limit(20),
      auth.serviceClient
        .from('missions')
        .select('id', { count: 'exact', head: true })
        .not('eope_event_id', 'is', null),
      auth.serviceClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .not('eope_user_id', 'is', null),
      auth.serviceClient
        .from('mission_assignments')
        .select(
          'mission_id, volunteer_id, mission:missions(id, title, eope_event_id, status), volunteer:profiles(id, full_name, eope_user_id)'
        )
        .in('assignment_status', ENGAGED_STATUSES)
    ]);

  // Bénévoles engagés sur une mission liée mais sans correspondance eOPE :
  // leur engagement ne sera pas poussé tant que l'admin ne les a pas liés.
  const seen = new Set<string>();
  const unlinkedEngaged: Array<{ volunteer_id: string; full_name: string | null; mission_id: string; mission_title: string }> = [];
  for (const row of (assignmentRows ?? []) as AssignmentRow[]) {
    const mission = firstOf(row.mission);
    const volunteer = firstOf(row.volunteer);
    if (!mission?.eope_event_id || !PUSH_MISSION_STATUSES.includes(mission.status)) continue;
    if (volunteer?.eope_user_id) continue;
    const key = `${row.mission_id}:${row.volunteer_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unlinkedEngaged.push({
      volunteer_id: row.volunteer_id,
      full_name: volunteer?.full_name ?? null,
      mission_id: row.mission_id,
      mission_title: mission.title
    });
  }

  return NextResponse.json({
    configured,
    baseUrl: config.baseUrl,
    syncWindowDays: config.syncWindowDays,
    cronConfigured: Boolean(config.cronSecret),
    lastRuns: runs ?? [],
    linkedMissionsCount: linkedMissionsCount ?? 0,
    linkedVolunteersCount: linkedVolunteersCount ?? 0,
    unlinkedEngaged
  });
}
