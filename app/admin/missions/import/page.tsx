'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  buildMissionDedupKey,
  getMissionDateForDedupFromStartsAt,
  MissionImportPreviewItem,
  NormalizedMissionImport,
  buildMissionsPreview,
  parseCsvContent,
  parseParisLocalToUtcIso,
  utcIsoToParisParts
} from '@/lib/import-missions';
import { MISSION_CATEGORY_LABELS, MISSION_CATEGORY_OPTIONS, MissionCategory, MissionStatus, Profile } from '@/lib/types';
import { supabase } from '@/lib/supabase/client';
import { MissionCardShell } from '@/components/missions/mission-card-shell';

type ImportFilter = 'nouveau' | 'modifié' | 'doublon' | 'invalide';

const IMPORT_STATUS_LABELS: Record<ImportFilter, string> = {
  nouveau: 'Nouveau',
  modifié: 'Modifié',
  doublon: 'Doublon',
  invalide: 'Invalide'
};

const IMPORT_STATUS_BADGE: Record<ImportFilter, string> = {
  nouveau: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  modifié: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200',
  doublon: 'bg-slate-200 text-slate-700 ring-1 ring-inset ring-slate-300',
  invalide: 'bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200'
};

const IMPORT_STATUS_CARD: Record<ImportFilter, string> = {
  nouveau: '',
  modifié: 'border-amber-200 bg-amber-50/60',
  doublon: 'border-slate-300 bg-slate-100/70',
  invalide: 'border-rose-200 bg-rose-50/65'
};

const MISSION_CATEGORY_BADGE_CLASSES: Record<string, string> = {
  poste_de_secours: 'bg-orange-400 text-slate-900',
  garde: 'bg-red-500 text-white',
  formation: 'bg-blue-900 text-white',
  maraude: 'bg-violet-500 text-white',
  vie_antenne: 'bg-sky-400 text-slate-900'
};

type EditableImportRow = {
  rowId: string;
  sourceBlockIndex: number;
  deleted: boolean;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  category: MissionCategory;
  do_status: string;
  retained_status: string;
  requirements_notes: string;
  equipment_notes: string;
  source_type_label: string;
  reversion_expected: string;
  reversion_actual: string;
  validation_date: string;
  raw_import_payload: Record<string, string | null>;
  issues: string[];
};

function parseTimeRangeFallback(value: string | null | undefined) {
  const match = value?.match(/(\d{1,2})\s*[h:]\s*(\d{2})\s*[-–]\s*(\d{1,2})\s*[h:]\s*(\d{2})/i);
  if (!match) {
    return null;
  }

  return {
    startTime: `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`,
    endTime: `${match[3].padStart(2, '0')}:${match[4].padStart(2, '0')}`
  };
}

function parseDateFallback(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const match = value.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!match) {
    return '';
  }

  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const rawYear = match[3];
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${month}-${day}`;
}

function inferRequiredVolunteersFromNotes(value: string | null | undefined) {
  if (!value) {
    return 1;
  }

  const match = value.match(/\d+/);
  if (!match) {
    return 1;
  }

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeEditableRow(item: MissionImportPreviewItem, index: number): EditableImportRow {
  const rawPayload = item.block.rawPairs.reduce<Record<string, string | null>>((acc, pair) => {
    acc[pair.label] = pair.value || null;
    return acc;
  }, {});

  if (item.normalized) {
    const starts = utcIsoToParisParts(item.normalized.starts_at);
    const ends = utcIsoToParisParts(item.normalized.ends_at);

    return {
      rowId: `row-${index}`,
      sourceBlockIndex: item.block.blockIndex,
      deleted: false,
      title: item.normalized.title,
      date: starts?.date ?? '',
      startTime: starts?.time ?? '',
      endTime: ends?.time ?? '',
      location: item.normalized.location ?? '',
      category: item.normalized.category,
      do_status: item.normalized.do_status ?? '',
      retained_status: item.normalized.retained_status ?? '',
      requirements_notes: item.normalized.requirements_notes ?? '',
      equipment_notes: item.normalized.equipment_notes ?? '',
      source_type_label: item.normalized.source_type_label ?? '',
      reversion_expected: item.normalized.reversion_expected !== null ? String(item.normalized.reversion_expected) : '',
      reversion_actual: item.normalized.reversion_actual !== null ? String(item.normalized.reversion_actual) : '',
      validation_date: item.normalized.validation_date ?? '',
      raw_import_payload: item.normalized.raw_import_payload,
      issues: item.issues.map((issue) => issue.message)
    };
  }

  const fallbackTimes = parseTimeRangeFallback(item.block.values.time_range);

  return {
    rowId: `row-${index}`,
    sourceBlockIndex: item.block.blockIndex,
    deleted: false,
    title: item.block.values.title ?? '',
    date: parseDateFallback(item.block.values.date),
    startTime: fallbackTimes?.startTime ?? '',
    endTime: fallbackTimes?.endTime ?? '',
    location: item.block.values.location ?? '',
    category: 'poste_de_secours',
    do_status: item.block.values.do_status ?? '',
    retained_status: item.block.values.retained_status ?? '',
    requirements_notes: item.block.values.requirements_notes ?? '',
    equipment_notes: item.block.values.equipment_notes ?? '',
    source_type_label: item.block.values.type ?? '',
    reversion_expected: item.block.values.reversion_expected ?? '',
    reversion_actual: item.block.values.reversion_actual ?? '',
    validation_date: parseDateFallback(item.block.values.validation_date),
    raw_import_payload: rawPayload,
    issues: item.issues.map((issue) => issue.message)
  };
}

function validateAndNormalizeRow(row: EditableImportRow): { normalized: NormalizedMissionImport | null; errors: string[] } {
  const errors: string[] = [];

  if (!row.title.trim()) {
    errors.push('Intitulé obligatoire.');
  }

  if (!row.date) {
    errors.push('Date obligatoire.');
  }

  if (!row.startTime || !row.endTime) {
    errors.push('Heure de début et de fin obligatoires.');
  }

  const [yearStr, monthStr, dayStr] = row.date.split('-');
  const [startHourStr, startMinuteStr] = row.startTime.split(':');
  const [endHourStr, endMinuteStr] = row.endTime.split(':');

  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);
  const startHour = Number.parseInt(startHourStr, 10);
  const startMinute = Number.parseInt(startMinuteStr, 10);
  const endHour = Number.parseInt(endHourStr, 10);
  const endMinute = Number.parseInt(endMinuteStr, 10);

  if ([year, month, day, startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) {
    errors.push('Date ou heure invalide.');
  }

  if (errors.length > 0) {
    return { normalized: null, errors };
  }

  const startsAtIso = parseParisLocalToUtcIso({ year, month, day, hour: startHour, minute: startMinute });
  let endsAtIso = parseParisLocalToUtcIso({ year, month, day, hour: endHour, minute: endMinute });

  if (!startsAtIso || !endsAtIso) {
    return { normalized: null, errors: ['Impossible de convertir la date/heure (timezone Europe/Paris).'] };
  }

  if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
    const nextDay = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    endsAtIso = parseParisLocalToUtcIso({
      year: nextDay.getUTCFullYear(),
      month: nextDay.getUTCMonth() + 1,
      day: nextDay.getUTCDate(),
      hour: endHour,
      minute: endMinute
    });

    if (!endsAtIso) {
      return { normalized: null, errors: ["Impossible de calculer l'heure de fin après minuit."] };
    }
  }

  const parseFrenchDecimal = (value: string) => {
    if (!value.trim()) {
      return null;
    }

    const parsed = Number.parseFloat(value.replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const reversionExpected = parseFrenchDecimal(row.reversion_expected);
  const reversionActual = parseFrenchDecimal(row.reversion_actual);

  return {
    normalized: {
      sourceBlockIndex: row.sourceBlockIndex,
      title: row.title.trim(),
      location: row.location.trim() || null,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      required_volunteers: inferRequiredVolunteersFromNotes(row.requirements_notes),
      category: row.category,
      do_status: row.do_status.trim() || null,
      retained_status: row.retained_status.trim() || null,
      requirements_notes: row.requirements_notes.trim() || null,
      equipment_notes: row.equipment_notes.trim() || null,
      source_type_label: row.source_type_label.trim() || null,
      reversion_expected: reversionExpected,
      reversion_actual: reversionActual,
      validation_date: row.validation_date || null,
      raw_import_payload: row.raw_import_payload
    },
    errors
  };
}

export default function AdminMissionImportPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<EditableImportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [existingMissionsMap, setExistingMissionsMap] = useState<Map<string, { id: string; ends_at: string; location: string | null }>>(new Map());
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateCheckError, setDuplicateCheckError] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [loadingFromGoogleSheet, setLoadingFromGoogleSheet] = useState(false);
  const [importStatus, setImportStatus] = useState<Extract<MissionStatus, 'draft' | 'proposed'>>('draft');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ImportFilter>('nouveau');

  useEffect(() => {
    async function loadProfile() {
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        router.replace('/login');
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id,full_name,email,phone,role,sector,created_at')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profileData) {
        setError('Impossible de charger votre profil.');
        setLoadingProfile(false);
        return;
      }

      setProfile(profileData);
      setLoadingProfile(false);
    }

    void loadProfile();
  }, [router]);

  const normalizedRows = useMemo(
    () =>
      rows
        .filter((row) => !row.deleted)
        .map((row) => ({ row, result: validateAndNormalizeRow(row) })),
    [rows]
  );

  const validMissionEntries = useMemo(
    () => normalizedRows.filter((entry) => entry.result.normalized && entry.result.errors.length === 0).map((entry) => ({ row: entry.row, mission: entry.result.normalized! })),
    [normalizedRows]
  );

  useEffect(() => {
    if (validMissionEntries.length === 0) {
      setExistingMissionsMap(new Map());
      setDuplicateCheckError(null);
      setCheckingDuplicates(false);
      return;
    }

    const startsAtValues = validMissionEntries.map((entry) => entry.mission.starts_at);
    const rangeStart = startsAtValues.reduce((min, current) => (current < min ? current : min), startsAtValues[0]);
    const rangeEnd = startsAtValues.reduce((max, current) => (current > max ? current : max), startsAtValues[0]);
    let cancelled = false;

    async function loadExistingMissions() {
      setCheckingDuplicates(true);
      setDuplicateCheckError(null);

      const { data, error: queryError } = await supabase
        .from('missions')
        .select('id,title,starts_at,ends_at,location')
        .gte('starts_at', rangeStart)
        .lte('starts_at', rangeEnd);

      if (cancelled) {
        return;
      }

      if (queryError) {
        setDuplicateCheckError("Impossible de vérifier les doublons existants en base. L'import reste possible.");
        setCheckingDuplicates(false);
        return;
      }

      const map = new Map<string, { id: string; ends_at: string; location: string | null }>();
      (data ?? []).forEach((mission) => {
        const missionDate = getMissionDateForDedupFromStartsAt(mission.starts_at);
        const key = buildMissionDedupKey({ title: mission.title ?? '', missionDate });
        if (key && !map.has(key)) {
          map.set(key, { id: mission.id, ends_at: mission.ends_at, location: mission.location ?? null });
        }
      });

      setExistingMissionsMap(map);
      setCheckingDuplicates(false);
    }

    void loadExistingMissions();

    return () => {
      cancelled = true;
    };
  }, [validMissionEntries]);

  const dedupAnalysis = useMemo(() => {
    const duplicateInFile = new Set<string>();
    const seenInFile = new Set<string>();
    const readyMissions: NormalizedMissionImport[] = [];
    const modifiedMissions: Array<{ id: string; mission: NormalizedMissionImport }> = [];
    const dedupRowStatuses = new Map<string, ImportFilter>();

    validMissionEntries.forEach(({ row, mission }) => {
      const key = buildMissionDedupKey({
        title: mission.title,
        missionDate: getMissionDateForDedupFromStartsAt(mission.starts_at)
      });
      if (!key) return;
      if (seenInFile.has(key)) {
        duplicateInFile.add(row.rowId);
      } else {
        seenInFile.add(key);
      }
    });

    validMissionEntries.forEach(({ row, mission }) => {
      const key = buildMissionDedupKey({
        title: mission.title,
        missionDate: getMissionDateForDedupFromStartsAt(mission.starts_at)
      });
      if (!key) return;

      if (duplicateInFile.has(row.rowId)) {
        dedupRowStatuses.set(row.rowId, 'doublon');
        return;
      }

      const existingMission = existingMissionsMap.get(key);
      if (existingMission) {
        const endsAtMatch = new Date(existingMission.ends_at).getTime() === new Date(mission.ends_at).getTime();
        const locationMatch = (existingMission.location?.trim() ?? '') === (mission.location?.trim() ?? '');
        if (endsAtMatch && locationMatch) {
          dedupRowStatuses.set(row.rowId, 'doublon');
        } else {
          dedupRowStatuses.set(row.rowId, 'modifié');
          modifiedMissions.push({ id: existingMission.id, mission });
        }
      } else {
        readyMissions.push(mission);
        dedupRowStatuses.set(row.rowId, 'nouveau');
      }
    });

    const ignoredAsDuplicateCount = validMissionEntries.filter(({ row }) => {
      const s = dedupRowStatuses.get(row.rowId);
      return s === 'doublon' || s === 'modifié';
    }).length;

    return { duplicateInFile, readyMissions, modifiedMissions, ignoredAsDuplicateCount, dedupRowStatuses };
  }, [existingMissionsMap, validMissionEntries]);

  const rowStatuses = useMemo((): Map<string, ImportFilter> => {
    const statuses = new Map<string, ImportFilter>(dedupAnalysis.dedupRowStatuses);
    normalizedRows.forEach(({ row, result }) => {
      if (result.errors.length > 0) {
        statuses.set(row.rowId, 'invalide');
      }
    });
    return statuses;
  }, [dedupAnalysis.dedupRowStatuses, normalizedRows]);

  const filterCounts = useMemo(() => {
    const c: Record<ImportFilter, number> = { nouveau: 0, modifié: 0, doublon: 0, invalide: 0 };
    for (const status of rowStatuses.values()) {
      c[status]++;
    }
    return c;
  }, [rowStatuses]);

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (row.deleted) return false;
      const status = rowStatuses.get(row.rowId);
      if (status !== activeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const searchable = [row.title, row.location].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [rows, rowStatuses, activeFilter, searchQuery]);

  function updateRow(rowId: string, patch: Partial<EditableImportRow>) {
    setRows((previous) => previous.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(null);

    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setAnalyzing(true);
    setFileName(file.name);

    const lowerName = file.name.toLowerCase();
    const isCsv = lowerName.endsWith('.csv');

    if (!isCsv) {
      setError('Cette V1 accepte uniquement les fichiers .csv dans cet environnement.');
      setAnalyzing(false);
      return;
    }

    const content = await file.text();
    const parsedRows = parseCsvContent(content);
    const preview = buildMissionsPreview(parsedRows);

    setRows(preview.items.map((item, index) => normalizeEditableRow(item, index)));
    setActiveFilter('nouveau');
    setSearchQuery('');
    setAnalyzing(false);
  }

  async function handleImport() {
    setError(null);
    setSuccess(null);

    if (!profile || profile.role !== 'admin') {
      setError('Accès refusé : seuls les admins peuvent importer.');
      return;
    }

    if (dedupAnalysis.readyMissions.length === 0) {
      setError('Aucune ligne nouvelle à importer (les lignes restantes sont invalides ou déjà existantes).');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setError('Session invalide. Veuillez vous reconnecter.');
      return;
    }

    setImporting(true);

    try {
      const response = await fetch('/api/admin/missions/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ missions: dedupAnalysis.readyMissions })
      });

      const payload = (await response.json()) as {
        error?: string;
        warning?: string;
        imported?: number;
        detected?: number;
        ignoredDuplicates?: number;
        failed?: number;
        importBatchId?: string;
        validationErrors?: Array<{ index: number; sourceBlockIndex: number; error: string }>;
      };

      if (!response.ok) {
        const details = (payload.validationErrors ?? []).map((item) => `Bloc #${item.sourceBlockIndex + 1}: ${item.error}`).join(' | ');
        setError([payload.error ?? 'Import impossible.', details].filter(Boolean).join(' '));
        return;
      }

      setSuccess(
        `Import terminé : ${payload.imported ?? 0} créées, ${payload.ignoredDuplicates ?? dedupAnalysis.ignoredAsDuplicateCount} doublons ignorés, ${payload.failed ?? 0} en échec.`
      );

      if (payload.warning) {
        setError(payload.warning);
      }
    } finally {
      setImporting(false);
    }
  }

  async function handleUpdateModified() {
    setError(null);
    setSuccess(null);

    if (!profile || profile.role !== 'admin') {
      setError('Accès refusé : seuls les admins peuvent mettre à jour des missions.');
      return;
    }

    if (dedupAnalysis.modifiedMissions.length === 0) {
      setError('Aucune mission modifiée à mettre à jour.');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setError('Session invalide. Veuillez vous reconnecter.');
      return;
    }

    setImporting(true);

    try {
      const response = await fetch('/api/admin/missions/import', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ missions: dedupAnalysis.modifiedMissions })
      });

      const payload = (await response.json()) as {
        error?: string;
        updated?: number;
        failed?: number;
      };

      if (!response.ok) {
        setError(payload.error ?? 'Mise à jour impossible.');
        return;
      }

      setSuccess(`Mise à jour terminée : ${payload.updated ?? 0} mission(s) mise(s) à jour, ${payload.failed ?? 0} en échec.`);
    } finally {
      setImporting(false);
    }
  }

  async function fetchAccessToken() {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token ?? null;
  }

  async function handleImportFromGoogleSheet() {
    setError(null);
    setSuccess(null);
    setLoadingFromGoogleSheet(true);

    try {
      const accessToken = await fetchAccessToken();
      if (!accessToken) {
        setError('Session invalide. Veuillez vous reconnecter.');
        return;
      }

      const response = await fetch('/api/admin/missions/import', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const payload = (await response.json()) as { error?: string; fileName?: string; content?: string };

      if (!response.ok || !payload.content) {
        setError(payload.error ?? "Impossible de récupérer le Google Sheet public.");
        return;
      }

      const parsedRows = parseCsvContent(payload.content);
      const preview = buildMissionsPreview(parsedRows);
      setRows(preview.items.map((item, index) => normalizeEditableRow(item, index)));
      setFileName(payload.fileName ?? 'google-sheet-public.csv');
      setActiveFilter('nouveau');
      setSearchQuery('');
      setSuccess('Import depuis Google Sheet chargé.');
    } finally {
      setLoadingFromGoogleSheet(false);
    }
  }

  async function importSingleMission(mission: NormalizedMissionImport) {
    setError(null);
    setSuccess(null);
    const accessToken = await fetchAccessToken();
    if (!accessToken) {
      setError('Session invalide. Veuillez vous reconnecter.');
      return;
    }

    setImporting(true);
    try {
      const response = await fetch('/api/admin/missions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ missions: [mission], importStatus })
      });
      const payload = (await response.json()) as { error?: string; imported?: number; ignoredDuplicates?: number };
      if (!response.ok) {
        setError(payload.error ?? 'Import impossible.');
        return;
      }

      setSuccess(`Import unitaire terminé : ${payload.imported ?? 0} créée(s), ${payload.ignoredDuplicates ?? 0} doublon(s) ignoré(s).`);
    } finally {
      setImporting(false);
    }
  }

  if (loadingProfile) {
    return <p className="text-sm text-slate-600">Chargement...</p>;
  }

  if (!profile || profile.role !== 'admin') {
    return <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Accès refusé : page réservée aux admins.</p>;
  }

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Importer des missions</h1>
      </header>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">Fichier (.csv, .xlsx, .xls)</label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={analyzing || importing}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
          <button
            type="button"
            onClick={handleImportFromGoogleSheet}
            disabled={analyzing || importing || loadingFromGoogleSheet}
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingFromGoogleSheet ? 'Chargement du Google Sheet...' : 'Importer depuis Google Sheet public'}
          </button>
        </div>
        {fileName ? <p className="mt-2 text-xs text-slate-500">Fichier sélectionné : <span className="font-medium text-slate-700">{fileName}</span></p> : null}
      </div>

      {rows.length > 0 ? (
        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="space-y-3">
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Rechercher une mission"
                className="w-full rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-700 placeholder:text-slate-500 focus:border-emerald-500 focus:bg-white focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
                {(['nouveau', 'modifié', 'doublon', 'invalide'] as ImportFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                      activeFilter === filter
                        ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                        : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {IMPORT_STATUS_LABELS[filter]} {filterCounts[filter]}
                  </button>
                ))}
              </div>
              {checkingDuplicates ? <p className="text-xs text-slate-500">Vérification des doublons en base en cours...</p> : null}
              {duplicateCheckError ? <p className="text-xs text-amber-700">{duplicateCheckError}</p> : null}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || dedupAnalysis.readyMissions.length === 0 || checkingDuplicates}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? 'Import en cours...' : `Importer toutes les nouvelles missions (${dedupAnalysis.readyMissions.length})`}
            </button>
            <button
              type="button"
              onClick={handleUpdateModified}
              disabled={importing || dedupAnalysis.modifiedMissions.length === 0 || checkingDuplicates}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? 'Mise à jour en cours...' : `Mettre à jour les missions modifiées (${dedupAnalysis.modifiedMissions.length})`}
            </button>
            <div className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Statut import</span>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setImportStatus('draft')}
                  disabled={importing}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${importStatus === 'draft' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Brouillon
                </button>
                <button
                  type="button"
                  onClick={() => setImportStatus('proposed')}
                  disabled={importing}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${importStatus === 'proposed' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Proposé
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {visibleRows.map((row) => {
              const validation = validateAndNormalizeRow(row);
              const rowStatus = rowStatuses.get(row.rowId) ?? 'invalide';
              const normalizedMission = validation.normalized;
              const isImportable = rowStatus === 'nouveau' && normalizedMission && validation.errors.length === 0;

              return (
                <MissionCardShell
                  key={row.rowId}
                  className={IMPORT_STATUS_CARD[rowStatus]}
                  headerLeft={
                    <>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${IMPORT_STATUS_BADGE[rowStatus]}`}>
                        {IMPORT_STATUS_LABELS[rowStatus]}
                      </span>
                      <span className="text-slate-400">|</span>
                      <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${MISSION_CATEGORY_BADGE_CLASSES[row.category] ?? 'bg-amber-400 text-slate-900'}`}>
                        {MISSION_CATEGORY_LABELS[row.category]}
                      </span>
                    </>
                  }
                  headerRight={
                    <span className="text-xs text-slate-400">Bloc #{row.sourceBlockIndex + 1}</span>
                  }
                  title={row.title || 'Sans intitulé'}
                  metadata={
                    <>{row.date || '-'} | {row.startTime || '-'} à {row.endTime || '-'}</>
                  }
                  location={<>Lieu : {row.location || '-'}</>}
                  description={
                    <div className="grid gap-x-4 gap-y-1 text-slate-700 md:grid-cols-2">
                      <p><span className="font-medium text-slate-900">Etat DO :</span> {row.do_status || '-'}</p>
                      <p><span className="font-medium text-slate-900">Retenue :</span> {row.retained_status || '-'}</p>
                      <p><span className="font-medium text-slate-900">Type source :</span> {row.source_type_label || '-'}</p>
                      <p><span className="font-medium text-slate-900">Réversion :</span> {row.reversion_expected || '-'}</p>
                      <p><span className="font-medium text-slate-900">Réversion réelle :</span> {row.reversion_actual || '-'}</p>
                      <p><span className="font-medium text-slate-900">Validation :</span> {row.validation_date || '-'}</p>
                      <p className="md:col-span-2"><span className="font-medium text-slate-900">Nombre de secouristes :</span> {row.requirements_notes || '-'}</p>
                      <p className="md:col-span-2"><span className="font-medium text-slate-900">Matériel spécifique :</span> {row.equipment_notes || '-'}</p>
                    </div>
                  }
                  actions={
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        onClick={() => setEditingRowId((current) => (current === row.rowId ? null : row.rowId))}
                        disabled={importing}
                      >
                        {editingRowId === row.rowId ? 'Fermer' : 'Éditer'}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                        onClick={() => updateRow(row.rowId, { deleted: true })}
                        disabled={importing}
                      >
                        Supprimer
                      </button>
                      {rowStatus === 'nouveau' ? (
                        <button
                          type="button"
                          className="rounded-md border border-emerald-300 bg-white px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => {
                            if (normalizedMission) {
                              void importSingleMission(normalizedMission);
                            }
                          }}
                          disabled={importing || checkingDuplicates || !isImportable}
                        >
                          Importer
                        </button>
                      ) : null}
                    </div>
                  }
                  footer={
                    <>
                      {editingRowId === row.rowId ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          <label className="text-slate-700">
                            Intitulé *
                            <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.title} onChange={(e) => updateRow(row.rowId, { title: e.target.value })} />
                          </label>
                          <label className="text-slate-700">
                            Lieu
                            <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.location} onChange={(e) => updateRow(row.rowId, { location: e.target.value })} />
                          </label>
                          <label className="text-slate-700">
                            Date *
                            <input type="date" className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.date} onChange={(e) => updateRow(row.rowId, { date: e.target.value })} />
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-slate-700">
                              Début *
                              <input type="time" className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.startTime} onChange={(e) => updateRow(row.rowId, { startTime: e.target.value })} />
                            </label>
                            <label className="text-slate-700">
                              Fin *
                              <input type="time" className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.endTime} onChange={(e) => updateRow(row.rowId, { endTime: e.target.value })} />
                            </label>
                          </div>
                          <label className="text-slate-700">
                            Catégorie
                            <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.category} onChange={(e) => updateRow(row.rowId, { category: e.target.value as MissionCategory })}>
                              {MISSION_CATEGORY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-slate-700">
                            Etat DO
                            <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.do_status} onChange={(e) => updateRow(row.rowId, { do_status: e.target.value })} />
                          </label>
                          <label className="text-slate-700">
                            Retenue
                            <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.retained_status} onChange={(e) => updateRow(row.rowId, { retained_status: e.target.value })} />
                          </label>
                          <label className="text-slate-700">
                            Type source
                            <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.source_type_label} onChange={(e) => updateRow(row.rowId, { source_type_label: e.target.value })} />
                          </label>
                          <label className="text-slate-700">
                            Réversion
                            <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.reversion_expected} onChange={(e) => updateRow(row.rowId, { reversion_expected: e.target.value })} />
                          </label>
                          <label className="text-slate-700">
                            Réversion réelle
                            <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.reversion_actual} onChange={(e) => updateRow(row.rowId, { reversion_actual: e.target.value })} />
                          </label>
                          <label className="text-slate-700">
                            Validation
                            <input type="date" className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.validation_date} onChange={(e) => updateRow(row.rowId, { validation_date: e.target.value })} />
                          </label>
                          <label className="text-slate-700 md:col-span-2">
                            Nombre de secouristes
                            <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.requirements_notes} onChange={(e) => updateRow(row.rowId, { requirements_notes: e.target.value })} />
                          </label>
                          <label className="text-slate-700 md:col-span-2">
                            Matériel spécifique
                            <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={row.equipment_notes} onChange={(e) => updateRow(row.rowId, { equipment_notes: e.target.value })} />
                          </label>
                        </div>
                      ) : null}

                      {row.issues.length > 0 ? (
                        <ul className={`space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 ${editingRowId === row.rowId ? 'mt-3' : ''}`}>
                          {row.issues.map((issue, index) => (
                            <li key={`${row.rowId}-warning-${index}`}>Warning: {issue}</li>
                          ))}
                        </ul>
                      ) : null}

                      {validation.errors.length > 0 ? (
                        <ul className={`space-y-1 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 ${editingRowId === row.rowId || row.issues.length > 0 ? 'mt-3' : ''}`}>
                          {validation.errors.map((issue, index) => (
                            <li key={`${row.rowId}-error-${index}`}>Erreur: {issue}</li>
                          ))}
                        </ul>
                      ) : rowStatus === 'nouveau' && !editingRowId ? (
                        <p className="text-xs text-emerald-700">Ligne valide.</p>
                      ) : null}
                    </>
                  }
                />
              );
            })}

            {visibleRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                Aucune mission avec le filtre &quot;{IMPORT_STATUS_LABELS[activeFilter]}&quot;
                {searchQuery.trim() ? ` et la recherche "${searchQuery}"` : ''}.
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRows([]);
                setFileName(null);
                setError(null);
                setSuccess(null);
                setSearchQuery('');
                setActiveFilter('nouveau');
              }}
              disabled={importing}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
