import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';
import type { AvailabilityDayAggregate, AvailabilityLevel } from '@/lib/types';

async function assertCanManageMissions(req: NextRequest) {
  const auth = await requirePermission(req, 'mission', 'can_manage');
  if (auth.errorResponse) return { client: null, error: auth.errorResponse };
  return { client: auth.serviceClient, error: null };
}

export async function GET(req: NextRequest) {
  const { client, error } = await assertCanManageMissions(req);
  if (error) return error;

  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const monthsParam = Number.parseInt(url.searchParams.get('months') ?? '', 10);
  const months = Number.isFinite(monthsParam) && monthsParam > 0 && monthsParam <= 6 ? monthsParam : 3;

  const from = fromParam ? new Date(fromParam) : new Date();
  if (Number.isNaN(from.getTime())) {
    return NextResponse.json({ error: 'Paramètre `from` invalide.' }, { status: 400 });
  }

  // Fenêtre alignée sur des mois calendaires [1er du mois de `from`, +months[.
  const fromMonthStart = new Date(from.getFullYear(), from.getMonth(), 1);
  const toMonthStart = new Date(fromMonthStart.getFullYear(), fromMonthStart.getMonth() + months, 1);
  const isoDate = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fromISO = isoDate(fromMonthStart);
  const toISO = isoDate(toMonthStart);

  const [declarationsRes, volunteersRes] = await Promise.all([
    client!.from('availability_declarations').select('day,level').gte('day', fromISO).lt('day', toISO),
    client!.from('profiles').select('id', { count: 'exact', head: true })
  ]);

  if (declarationsRes.error) return NextResponse.json({ error: declarationsRes.error.message }, { status: 500 });
  if (volunteersRes.error) return NextResponse.json({ error: volunteersRes.error.message }, { status: 500 });

  const byDay = new Map<string, AvailabilityDayAggregate>();
  for (const row of (declarationsRes.data ?? []) as Array<{ day: string; level: AvailabilityLevel }>) {
    const entry =
      byDay.get(row.day) ??
      ({
        day: row.day,
        score: 0,
        respondedCount: 0,
        readyCount: 0,
        zeroCount: 0,
        levelCounts: { 0: 0, 1: 0, 2: 0, 3: 0 }
      } satisfies AvailabilityDayAggregate);

    entry.score += row.level;
    entry.respondedCount += 1;
    if (row.level >= 2) entry.readyCount += 1;
    if (row.level === 0) entry.zeroCount += 1;
    entry.levelCounts[row.level] += 1;
    byDay.set(row.day, entry);
  }

  return NextResponse.json({
    volunteerCount: volunteersRes.count ?? 0,
    from: fromISO,
    months,
    days: Array.from(byDay.values())
  });
}
