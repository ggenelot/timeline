import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseAnonClient, createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { MissionCategory } from '@/lib/types';

type ImportMissionPayload = {
  sourceBlockIndex: number;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string;
  required_volunteers: number;
  category: MissionCategory;
  do_status: string | null;
  retained_status: string | null;
  requirements_notes: string | null;
  equipment_notes: string | null;
  source_type_label: string | null;
  reversion_expected: number | null;
  reversion_actual: number | null;
  validation_date: string | null;
  raw_import_payload: Record<string, string | null>;
};

type ImportRequestBody = {
  missions?: ImportMissionPayload[];
};

function getBearerToken(request: NextRequest): string {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.replace('Bearer ', '').trim() : '';
}

function isValidCategory(value: string): value is MissionCategory {
  return ['maraude', 'garde', 'formation', 'vie_antenne'].includes(value);
}

function normalizeCategory(value: string | null | undefined): MissionCategory {
  if (!value) {
    return 'maraude';
  }

  if (isValidCategory(value)) {
    return value;
  }

  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (normalized.includes('garde') || normalized.includes('poste de secours') || normalized.includes('pds')) {
    return 'garde';
  }

  if (normalized.includes('format')) {
    return 'formation';
  }

  if (normalized.includes('antenne') || normalized.includes('vie')) {
    return 'vie_antenne';
  }

  return 'maraude';
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validateMissionPayload(mission: ImportMissionPayload) {
  if (!mission.title?.trim()) {
    return 'Le titre est obligatoire.';
  }

  if (!Number.isInteger(mission.required_volunteers) || mission.required_volunteers < 1) {
    return 'Le nombre de bénévoles requis doit être un entier positif.';
  }

  const startsAt = new Date(mission.starts_at);
  const endsAt = new Date(mission.ends_at);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return 'La date/heure de début ou de fin est invalide.';
  }

  if (endsAt <= startsAt) {
    return 'La date/heure de fin doit être postérieure au début.';
  }

  if (mission.validation_date && !isIsoDate(mission.validation_date)) {
    return 'Le format de date de validation est invalide (YYYY-MM-DD attendu).';
  }

  return null;
}

type ValidationError = { index: number; sourceBlockIndex: number; error: string };
const OPTIONAL_IMPORT_COLUMNS = [
  'do_status',
  'retained_status',
  'requirements_notes',
  'equipment_notes',
  'source_type_label',
  'reversion_expected',
  'reversion_actual',
  'validation_date',
  'raw_import_payload',
  'import_batch_id'
] as const;

function getMissingColumnFromError(message: string) {
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const requesterClient = createServerSupabaseAnonClient(token);
  const { data: userData, error: userError } = await requesterClient.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const { data: requesterProfile, error: requesterProfileError } = await requesterClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (requesterProfileError || !requesterProfile || requesterProfile.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé : seuls les admins peuvent importer des missions.' }, { status: 403 });
  }

  let body: ImportRequestBody;

  try {
    body = (await request.json()) as ImportRequestBody;
  } catch {
    return NextResponse.json({ error: 'Le corps de la requête est invalide.' }, { status: 400 });
  }

  const missions = body.missions ?? [];

  if (!Array.isArray(missions) || missions.length === 0) {
    return NextResponse.json({ error: 'Aucune mission valide à importer.' }, { status: 400 });
  }

  const validationErrors = missions
    .map((mission, index) => {
      const error = validateMissionPayload(mission);
      return error ? { index, sourceBlockIndex: mission.sourceBlockIndex, error } : null;
    })
    .filter((item): item is ValidationError => item !== null);

  const validMissions = missions.filter((_, index) => !validationErrors.some((error) => error.index === index));

  if (validMissions.length === 0) {
    return NextResponse.json(
      {
        error: 'Le lot contient uniquement des missions invalides.',
        details: validationErrors
      },
      { status: 400 }
    );
  }

  const serviceClient = createServerSupabaseServiceClient();
  const importBatchId = crypto.randomUUID();

  const payload: Record<string, unknown>[] = validMissions.map((mission) => ({
    title: mission.title.trim(),
    description: null,
    location: mission.location,
    sector: null,
    starts_at: mission.starts_at,
    ends_at: mission.ends_at,
    required_volunteers: mission.required_volunteers,
    category: normalizeCategory(mission.category),
    status: 'draft',
    created_by: userData.user.id,
    do_status: mission.do_status,
    retained_status: mission.retained_status,
    requirements_notes: mission.requirements_notes,
    equipment_notes: mission.equipment_notes,
    source_type_label: mission.source_type_label,
    reversion_expected: mission.reversion_expected,
    reversion_actual: mission.reversion_actual,
    validation_date: mission.validation_date,
    raw_import_payload: mission.raw_import_payload,
    import_batch_id: importBatchId
  }));

  let candidatePayload = payload;
  const removedColumns = new Set<string>();
  let insertedMissions: Array<{ id: string; title: string }> | null = null;
  let insertError: { message: string } | null = null;

  while (true) {
    const result = await serviceClient.from('missions').insert(candidatePayload).select('id,title');
    insertedMissions = result.data;
    insertError = result.error;

    if (!insertError) {
      break;
    }

    const missingColumn = getMissingColumnFromError(insertError.message);

    if (!missingColumn || !OPTIONAL_IMPORT_COLUMNS.includes(missingColumn as (typeof OPTIONAL_IMPORT_COLUMNS)[number])) {
      break;
    }

    if (removedColumns.has(missingColumn)) {
      break;
    }

    removedColumns.add(missingColumn);
    candidatePayload = candidatePayload.map((mission) => {
      const { [missingColumn]: _ignored, ...rest } = mission;
      return rest;
    });
  }

  if (insertError) {
    return NextResponse.json({ error: `Échec de l'import : ${insertError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    importBatchId,
    detected: missions.length,
    imported: insertedMissions?.length ?? 0,
    failed: missions.length - (insertedMissions?.length ?? 0),
    insertedMissions: insertedMissions ?? [],
    validationErrors,
    warning:
      removedColumns.size > 0
        ? `Import partiel des colonnes additionnelles (${Array.from(removedColumns).join(', ')}). Exécutez les migrations Supabase pour aligner le schéma local.`
        : undefined
  });
}
