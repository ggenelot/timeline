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
  requirements_notes: string | null;
  equipment_notes: string | null;
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

  if (!isValidCategory(mission.category)) {
    return 'La catégorie de mission est invalide.';
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
    .filter((item): item is { index: number; sourceBlockIndex: number; error: string } => item !== null);

  if (validationErrors.length > 0) {
    return NextResponse.json(
      {
        error: 'Le lot contient des missions invalides.',
        details: validationErrors
      },
      { status: 400 }
    );
  }

  const serviceClient = createServerSupabaseServiceClient();
  const importBatchId = crypto.randomUUID();

  const payload = missions.map((mission) => ({
    title: mission.title.trim(),
    description: null,
    location: mission.location,
    sector: null,
    starts_at: mission.starts_at,
    ends_at: mission.ends_at,
    required_volunteers: mission.required_volunteers,
    category: mission.category,
    status: 'draft',
    created_by: userData.user.id,
    do_status: mission.do_status,
    requirements_notes: mission.requirements_notes,
    equipment_notes: mission.equipment_notes,
    reversion_expected: mission.reversion_expected,
    reversion_actual: mission.reversion_actual,
    validation_date: mission.validation_date,
    raw_import_payload: mission.raw_import_payload,
    import_batch_id: importBatchId
  }));

  const { data: insertedMissions, error: insertError } = await serviceClient.from('missions').insert(payload).select('id,title');

  if (insertError) {
    return NextResponse.json({ error: `Échec de l'import : ${insertError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    importBatchId,
    detected: missions.length,
    imported: insertedMissions?.length ?? 0,
    failed: 0,
    insertedMissions: insertedMissions ?? []
  });
}
