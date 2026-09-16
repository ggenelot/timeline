import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';
import { shortName } from '@/lib/availability';
import type { AvailabilityDayAggregate, AvailabilityLevel, AvailabilityPersonName } from '@/lib/types';

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

  type DeclRow = {
    volunteer_id: string;
    day: string;
    level: AvailabilityLevel;
    available_from: string | null;
    available_until: string | null;
  };
  type ProfileRow = { id: string; full_name: string | null };

  // PostgREST plafonne chaque réponse (max-rows, 1000 par défaut) : on pagine
  // pour ne tronquer ni les déclarations (volontaires × jours peut dépasser 1000)
  // ni la liste des profils (sinon volunteerCount et « sans réponse » faussés).
  const PAGE_SIZE = 1000;
  async function fetchAllPages<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await build(from, from + PAGE_SIZE - 1);
      if (error) return { data: null, error };
      const page = data ?? [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return { data: rows, error: null };
  }

  const [declarationsRes, volunteersRes] = await Promise.all([
    fetchAllPages<DeclRow>((from, to) =>
      client!
        .from('availability_declarations')
        .select('volunteer_id,day,level,available_from,available_until')
        .gte('day', fromISO)
        .lt('day', toISO)
        .range(from, to)
    ),
    fetchAllPages<ProfileRow>((from, to) => client!.from('profiles').select('id,full_name').range(from, to))
  ]);

  if (declarationsRes.error) return NextResponse.json({ error: declarationsRes.error.message }, { status: 500 });
  if (volunteersRes.error) return NextResponse.json({ error: volunteersRes.error.message }, { status: 500 });

  const volunteers = volunteersRes.data ?? [];
  const volunteerCount = volunteers.length;
  const nameById = new Map(volunteers.map((v) => [v.id, shortName(v.full_name)]));

  function emptyLevelNames(): Record<AvailabilityLevel, AvailabilityPersonName[]> {
    return { 0: [], 1: [], 2: [], 3: [] };
  }

  const byDay = new Map<string, AvailabilityDayAggregate>();
  const respondersByDay = new Map<string, Set<string>>();

  for (const row of declarationsRes.data ?? []) {
    const entry =
      byDay.get(row.day) ??
      ({
        day: row.day,
        score: 0,
        respondedCount: 0,
        readyCount: 0,
        zeroCount: 0,
        levelCounts: { 0: 0, 1: 0, 2: 0, 3: 0 },
        namesByLevel: emptyLevelNames(),
        noResponseNames: [],
        constraintCount: 0
      } satisfies AvailabilityDayAggregate);

    entry.score += row.level;
    entry.respondedCount += 1;
    if (row.level >= 2) entry.readyCount += 1;
    if (row.level === 0) entry.zeroCount += 1;
    entry.levelCounts[row.level] += 1;
    entry.namesByLevel[row.level].push({
      name: nameById.get(row.volunteer_id) ?? 'Bénévole',
      available_from: row.available_from,
      available_until: row.available_until
    });
    if (row.available_from !== null || row.available_until !== null) entry.constraintCount += 1;
    byDay.set(row.day, entry);

    const responders = respondersByDay.get(row.day) ?? new Set<string>();
    responders.add(row.volunteer_id);
    respondersByDay.set(row.day, responders);
  }

  const collator = new Intl.Collator('fr');
  for (const [day, entry] of byDay) {
    for (const level of [0, 1, 2, 3] as AvailabilityLevel[]) {
      entry.namesByLevel[level].sort((a, b) => collator.compare(a.name, b.name));
    }
    const responders = respondersByDay.get(day) ?? new Set<string>();
    entry.noResponseNames = volunteers
      .filter((v) => !responders.has(v.id))
      .map((v) => nameById.get(v.id) ?? 'Bénévole')
      .sort((a, b) => collator.compare(a, b));
  }

  return NextResponse.json({
    volunteerCount,
    from: fromISO,
    months,
    days: Array.from(byDay.values())
  });
}
