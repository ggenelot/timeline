import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerSupabaseAnonClient, createServerSupabaseServiceClient } from '@/lib/supabase/server';

// Maps normalised skill column headers to their DB label.
// Keys are lowercased, accents removed, spaces normalised.
const SKILL_HEADER_TO_LABEL: Record<string, string> = {
  'pse1': 'PSE1',
  'pse2': 'PSE2',
  'fc pse': 'FC PSE',
  'ce': 'CE',
  'cp': 'CP',
  'ceps': 'CEPS',
  'ars': 'ARS',
  'bnssa': 'BNSSA',
  'ssa': 'SSA',
  'bord de terrain': 'BORD DE TERRAIN',
  '3s': '3S',
  'ce2s': 'CE2S',
  'fc ce2s': 'FC CE2S',
  'aep1': 'AEP1',
  'aep2': 'AEP2',
  'pic f': 'PIC F',
  'f psc': 'F PSC',
  'f ps': 'F PS',
  'f f psc/ps': 'F F PSC/PS',
  'fc f psc/ps': 'FC F PSC/PS',
  'osps': 'OSPS',
  'tsps': 'TSPS',
  'tronconnage': 'TRONCONNAGE',
  'travail en hauteur': 'TRAVAIL EN HAUTEUR',
  'ch vps': 'CH VPS',
  'ch vtp': 'CH VTP',
  'ch pl': 'CH PL',
  'epi': 'EPI',
  'ecg': 'ECG',
  'argos / efibi': 'Argos / eFIBI',
  'argos/efibi': 'Argos / eFIBI',
  'radio': 'Radio',
  'cardiopompe': 'CardioPompe',
  'portage': 'PORTAGE',
  'sensibilisation vss': 'Sensibilisation VSS',
};

const VALID_STATUSES = new Set(['valide', 'a_faire', 'interesse', 'exempte']);

function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStatus(raw: string): string | null {
  const s = normalizeHeader(raw).replace(/\s+/g, '_');
  return VALID_STATUSES.has(s) ? s : null;
}

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

type ParsedVolunteer = {
  name: string;
  skills: Record<string, string>; // DB label → status
};

function parseSkillsSheet(buffer: ArrayBuffer): ParsedVolunteer[] {
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });

  if (rows.length < 2) return [];

  // Find the header row: look for the row containing "Bénévoles" or "PSE1"
  let headerRowIdx = -1;
  let nameColIdx = 0;

  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i];
    for (let j = 0; j < row.length; j++) {
      const cell = normalizeHeader(String(row[j] || ''));
      if (cell === 'benevoles' || cell.endsWith('/benevoles')) {
        headerRowIdx = i;
        nameColIdx = j;
        break;
      }
    }
    if (headerRowIdx >= 0) break;

    // Fallback: row containing PSE1 is the skill header row
    if (row.some((c) => String(c || '').trim().toUpperCase() === 'PSE1')) {
      headerRowIdx = i;
      nameColIdx = 0;
      break;
    }
  }

  if (headerRowIdx < 0) {
    throw new Error('Structure invalide : impossible de trouver la ligne d\'en-têtes (colonne "Bénévoles" ou "PSE1" absente des 5 premières lignes).');
  }

  const headerRow = rows[headerRowIdx].map((c) => String(c || ''));

  // Find INNACTIF column (skip inactive volunteers)
  const inactifColIdx = headerRow.findIndex((h) => normalizeHeader(h) === 'innactif' || normalizeHeader(h).endsWith('/innactif'));

  // Build skill column map: column index → DB label
  const skillColMap = new Map<number, string>();

  headerRow.forEach((rawHeader, idx) => {
    if (idx === nameColIdx) return;
    const normalized = normalizeHeader(rawHeader);
    // Strip a leading "OPE/", "ACSSO/", etc. prefix if present
    const withoutCategoryPrefix = normalized.includes('/') ? normalized.split('/').slice(1).join('/') : normalized;
    const label = SKILL_HEADER_TO_LABEL[normalized] ?? SKILL_HEADER_TO_LABEL[withoutCategoryPrefix];
    if (label) skillColMap.set(idx, label);
  });

  const volunteers: ParsedVolunteer[] = [];

  for (let rowIdx = headerRowIdx + 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const name = String(row[nameColIdx] || '').trim();
    if (!name) continue;

    if (inactifColIdx >= 0) {
      const inactif = String(row[inactifColIdx] || '').trim().toUpperCase();
      if (inactif === 'TRUE' || inactif === 'VRAI') continue;
    }

    const skills: Record<string, string> = {};
    for (const [colIdx, label] of skillColMap) {
      const status = normalizeStatus(String(row[colIdx] || ''));
      if (status) skills[label] = status;
    }

    volunteers.push({ name, skills });
  }

  return volunteers;
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

  if (!token) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  const requesterClient = createServerSupabaseAnonClient(token);
  const { data: userData, error: userError } = await requesterClient.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });
  }

  const { data: profile } = await requesterClient.from('profiles').select('role').eq('id', userData.user.id).single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé : seuls les administrateurs peuvent importer des compétences.' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Requête invalide (attendu multipart/form-data).' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'Aucun fichier reçu (champ "file" manquant).' }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
    return NextResponse.json({ error: 'Format non supporté. Utilisez .xlsx, .xls ou .csv.' }, { status: 400 });
  }

  let volunteers: ParsedVolunteer[];
  try {
    const buffer = await file.arrayBuffer();
    volunteers = parseSkillsSheet(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de lecture du fichier.';
    return NextResponse.json({ error: message }, { status: 422 });
  }

  if (volunteers.length === 0) {
    return NextResponse.json({ error: 'Aucun bénévole trouvé dans le fichier.' }, { status: 422 });
  }

  const serviceClient = createServerSupabaseServiceClient();

  const { data: profiles, error: profilesError } = await serviceClient
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'benevole');

  if (profilesError) {
    return NextResponse.json({ error: `Impossible de charger les profils : ${profilesError.message}` }, { status: 500 });
  }

  // Build name → profile_id map (try both Prénom Nom and Nom Prénom orderings)
  const nameToProfileId = new Map<string, string>();
  for (const p of profiles ?? []) {
    if (!p.full_name) continue;
    const normalized = normalizeName(p.full_name);
    nameToProfileId.set(normalized, p.id);
    const parts = normalized.split(' ');
    if (parts.length >= 2) {
      const reversed = [...parts.slice(1), parts[0]].join(' ');
      if (!nameToProfileId.has(reversed)) nameToProfileId.set(reversed, p.id);
    }
  }

  const { data: allSkills, error: skillsError } = await serviceClient.from('skills').select('id, label');

  if (skillsError) {
    return NextResponse.json({ error: `Impossible de charger les compétences : ${skillsError.message}` }, { status: 500 });
  }

  const labelToSkillId = new Map<string, string>();
  for (const s of allSkills ?? []) {
    labelToSkillId.set(s.label.trim().toLowerCase(), s.id);
  }

  type ImportResult = {
    name: string;
    status: 'updated' | 'not_found' | 'error';
    skillsSet?: number;
    message?: string;
  };

  const results: ImportResult[] = [];
  let totalUpdated = 0;
  let totalNotFound = 0;

  for (const volunteer of volunteers) {
    const profileId = nameToProfileId.get(normalizeName(volunteer.name));

    if (!profileId) {
      results.push({ name: volunteer.name, status: 'not_found' });
      totalNotFound++;
      continue;
    }

    const skillRecords = Object.entries(volunteer.skills)
      .map(([label, status]) => {
        const skillId = labelToSkillId.get(label.toLowerCase());
        return skillId ? { profile_id: profileId, skill_id: skillId, status } : null;
      })
      .filter((r): r is { profile_id: string; skill_id: string; status: string } => r !== null);

    // Full replacement: the file is the source of truth
    const { error: deleteError } = await serviceClient.from('profile_skills').delete().eq('profile_id', profileId);

    if (deleteError) {
      results.push({ name: volunteer.name, status: 'error', message: deleteError.message });
      continue;
    }

    if (skillRecords.length > 0) {
      const { error: insertError } = await serviceClient.from('profile_skills').insert(skillRecords);
      if (insertError) {
        results.push({ name: volunteer.name, status: 'error', message: insertError.message });
        continue;
      }
    }

    results.push({ name: volunteer.name, status: 'updated', skillsSet: skillRecords.length });
    totalUpdated++;
  }

  return NextResponse.json({
    message: `Import terminé : ${totalUpdated} bénévole(s) mis à jour, ${totalNotFound} non trouvé(s).`,
    totalUpdated,
    totalNotFound,
    results,
  });
}