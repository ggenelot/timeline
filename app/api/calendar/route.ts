import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseAnonClient } from '@/lib/supabase/server';

type CalendarFilter = 'all' | 'positioned' | 'retained';
type MissionItem = { id: string; title: string; starts_at: string; ends_at: string | null; location: string | null;  status: string };

const formatUtc = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const escapeIcs = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const parseFilter = (value: string | null): CalendarFilter => (value === 'positioned' || value === 'retained' ? value : 'all');

async function loadMissions(filter: CalendarFilter, userId: string, token: string): Promise<MissionItem[]> {
  const client = createServerSupabaseAnonClient(token);

  if (filter === 'retained') {
    const { data, error } = await client.from('mission_assignments').select('mission:missions(id,title,starts_at,ends_at,location,status)').eq('volunteer_id', userId).in('assignment_status', ['selected', 'confirmed']);
    if (error) throw error;
    return (data ?? []).map((row) => (Array.isArray(row.mission) ? row.mission[0] : row.mission)).filter((mission): mission is MissionItem => Boolean(mission));
  }

  if (filter === 'positioned') {
    const { data, error } = await client.from('mission_proposals').select('mission:missions(id,title,starts_at,ends_at,location,status)').eq('volunteer_id', userId).neq('response', 'no_response');
    if (error) throw error;
    return (data ?? []).map((row) => (Array.isArray(row.mission) ? row.mission[0] : row.mission)).filter((mission): mission is MissionItem => Boolean(mission));
  }

  const { data, error } = await client.from('missions').select('id,title,starts_at,ends_at,location,status').eq('status', 'proposed').order('starts_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function GET(request: NextRequest) {
  const token = getBearerToken(request) || (request.nextUrl.searchParams.get('token')?.trim() ?? '');
  if (!token) return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.user || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'benevole') return NextResponse.json({ error: 'Ce flux calendrier est réservé aux bénévoles.' }, { status: 403 });

  const filter = parseFilter(request.nextUrl.searchParams.get('filter'));

  try {
    const missions = await loadMissions(filter, auth.user.id, token);
    const now = formatUtc(new Date().toISOString());

    const events = missions.map((mission) => {
      const endIso = mission.ends_at ?? new Date(new Date(mission.starts_at).getTime() + 2 * 60 * 60 * 1000).toISOString();
      return [
        'BEGIN:VEVENT',
        `UID:mission-${mission.id}@timeline`,
        `DTSTAMP:${now}`,
        `DTSTART:${formatUtc(mission.starts_at)}`,
        `DTEND:${formatUtc(endIso)}`,
        `SUMMARY:${escapeIcs(mission.title)}`,
        `LOCATION:${escapeIcs(mission.location ?? 'Non défini')}`,
        `DESCRIPTION:${escapeIcs(`Statut: ${mission.status}`)}`,
        `URL:${request.nextUrl.origin}/missions/${mission.id}`,
        'END:VEVENT'
      ].join('\r\n');
    });

    return new NextResponse(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Timeline//Calendrier Missions//FR', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n'), {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `inline; filename="missions-${filter}.ics"`, 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return NextResponse.json({ error: `Impossible de générer le calendrier : ${error instanceof Error ? error.message : 'Erreur inconnue'}` }, { status: 500 });
  }
}
