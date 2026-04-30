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
import { MISSION_CATEGORY_LABELS, MISSION_CATEGORY_OPTIONS, MissionCategory, Profile } from '@/lib/types';
import { supabase } from '@/lib/supabase/client';

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
      return { normalized: null, errors: ['Impossible de calculer l’heure de fin après minuit.'] };
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
      required_volunteers: 1,
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
  const [existingMissionKeys, setExistingMissionKeys] = useState<Set<string>>(new Set());
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateCheckError, setDuplicateCheckError] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [loadingFromGoogleSheet, setLoadingFromGoogleSheet] = useState(false);

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
      setExistingMissionKeys(new Set());
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
        .select('title,starts_at')
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

      const keys = new Set<string>();
      (data ?? []).forEach((mission) => {
        const missionDate = getMissionDateForDedupFromStartsAt(mission.starts_at);
        const key = buildMissionDedupKey({ title: mission.title ?? '', missionDate });
        if (key) {
          keys.add(key);
        }
      });

      setExistingMissionKeys(keys);
      setCheckingDuplicates(false);
    }

    void loadExistingMissions();

    return () => {
      cancelled = true;
    };
  }, [validMissionEntries]);

  const dedupAnalysis = useMemo(() => {
    const duplicateInFile = new Set<string>();
    const duplicateInDatabase = new Set<string>();
    const seenInFile = new Set<string>();
    const readyMissions: NormalizedMissionImport[] = [];

    validMissionEntries.forEach(({ row, mission }) => {
      const key = buildMissionDedupKey({
        title: mission.title,
        missionDate: getMissionDateForDedupFromStartsAt(mission.starts_at)
      });

      if (!key) {
        return;
      }

      const isFileDuplicate = seenInFile.has(key);
      if (isFileDuplicate) {
        duplicateInFile.add(row.rowId);
      } else {
        seenInFile.add(key);
      }

      const isDatabaseDuplicate = existingMissionKeys.has(key);
      if (isDatabaseDuplicate) {
        duplicateInDatabase.add(row.rowId);
      }

      if (!isFileDuplicate && !isDatabaseDuplicate) {
        readyMissions.push(mission);
      }
    });

    return {
      duplicateInFile,
      duplicateInDatabase,
      readyMissions,
      ignoredAsDuplicateCount: new Set([...duplicateInFile, ...duplicateInDatabase]).size
    };
  }, [existingMissionKeys, validMissionEntries]);

  const previewInvalidCount = useMemo(() => {
    return rows.filter((row) => !row.deleted).length - dedupAnalysis.readyMissions.length - dedupAnalysis.ignoredAsDuplicateCount;
  }, [dedupAnalysis.ignoredAsDuplicateCount, dedupAnalysis.readyMissions.length, rows]);

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
      setSuccess('Import depuis Google Sheet chargé (11 premières lignes seulement).');
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
        body: JSON.stringify({ missions: [mission] })
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
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Importer des missions</h1>
        <p className="text-sm text-slate-600">Les horaires importés sont interprétés en timezone Europe/Paris.</p>
      </header>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="rounded-md border border-slate-200 p-3">
        <label className="block text-sm text-slate-700">
          Fichier (.csv, .xlsx, .xls)
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={analyzing || importing}
            className="mt-1 block w-full text-sm"
          />
        </label>
        <button
          type="button"
          onClick={handleImportFromGoogleSheet}
          disabled={analyzing || importing || loadingFromGoogleSheet}
          className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingFromGoogleSheet ? 'Chargement du Google Sheet...' : 'Importer depuis Google Sheet public'}
        </button>
        {fileName ? <p className="mt-2 text-xs text-slate-500">Fichier sélectionné : {fileName}</p> : null}
      </div>

      {rows.length > 0 ? (
        <div className="space-y-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p>{dedupAnalysis.readyMissions.length} lignes prêtes à être importées</p>
            <p>{dedupAnalysis.ignoredAsDuplicateCount} lignes ignorées (déjà existantes ou dupliquées dans le fichier)</p>
            <p>{previewInvalidCount} lignes invalides à corriger</p>
            {checkingDuplicates ? <p>Vérification des doublons en base en cours...</p> : null}
            {duplicateCheckError ? <p className="text-amber-700">{duplicateCheckError}</p> : null}
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || dedupAnalysis.readyMissions.length === 0 || checkingDuplicates}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? 'Import en cours...' : `Importer toutes les missions (${dedupAnalysis.readyMissions.length})`}
            </button>
            {rows.map((row) => {
              if (row.deleted) {
                return null;
              }

              const validation = validateAndNormalizeRow(row);
              const isDuplicateInFile = dedupAnalysis.duplicateInFile.has(row.rowId);
              const isDuplicateInDatabase = dedupAnalysis.duplicateInDatabase.has(row.rowId);
              const isDuplicate = isDuplicateInFile || isDuplicateInDatabase;
              if (isDuplicate) {
                return null;
              }
              const normalizedMission = validation.normalized;
              const isImportable = normalizedMission && validation.errors.length === 0;

              return (
                <article key={row.rowId} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 text-sm shadow-sm">
                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-900">Bloc #{row.sourceBlockIndex + 1}</p>
                      <div className="flex items-center gap-2">
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
                      </div>
                    </div>

                    <div className="grid gap-2 text-slate-700 md:grid-cols-2">
                      <p><span className="font-medium text-slate-900">Intitulé :</span> {row.title || '-'} </p>
                      <p><span className="font-medium text-slate-900">Lieu :</span> {row.location || '-'} </p>
                      <p><span className="font-medium text-slate-900">Date :</span> {row.date || '-'} </p>
                      <p><span className="font-medium text-slate-900">Début :</span> {row.startTime || '-'} | <span className="font-medium text-slate-900">Fin :</span> {row.endTime || '-'} </p>
                      <p><span className="font-medium text-slate-900">Catégorie :</span> {MISSION_CATEGORY_LABELS[row.category]} </p>
                      <p><span className="font-medium text-slate-900">Etat DO :</span> {row.do_status || '-'} </p>
                      <p><span className="font-medium text-slate-900">Retenue :</span> {row.retained_status || '-'} </p>
                      <p><span className="font-medium text-slate-900">Type source :</span> {row.source_type_label || '-'} </p>
                      <p><span className="font-medium text-slate-900">Réversion :</span> {row.reversion_expected || '-'} </p>
                      <p><span className="font-medium text-slate-900">Réversion réelle :</span> {row.reversion_actual || '-'} </p>
                      <p><span className="font-medium text-slate-900">Validation :</span> {row.validation_date || '-'} </p>
                      <p className="md:col-span-2"><span className="font-medium text-slate-900">Nombre de secouristes :</span> {row.requirements_notes || '-'} </p>
                      <p className="md:col-span-2"><span className="font-medium text-slate-900">Matériel spécifique :</span> {row.equipment_notes || '-'} </p>
                    </div>

                    {editingRowId === row.rowId ? <div className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-2">
                    <label className="text-slate-700">
                      Intitulé *
                      <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.title} onChange={(e) => updateRow(row.rowId, { title: e.target.value })} />
                    </label>
                    <label className="text-slate-700">
                      Lieu
                      <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.location} onChange={(e) => updateRow(row.rowId, { location: e.target.value })} />
                    </label>
                    <label className="text-slate-700">
                      Date *
                      <input type="date" className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.date} onChange={(e) => updateRow(row.rowId, { date: e.target.value })} />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-slate-700">
                        Début *
                        <input type="time" className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.startTime} onChange={(e) => updateRow(row.rowId, { startTime: e.target.value })} />
                      </label>
                      <label className="text-slate-700">
                        Fin *
                        <input type="time" className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.endTime} onChange={(e) => updateRow(row.rowId, { endTime: e.target.value })} />
                      </label>
                    </div>
                    <label className="text-slate-700">
                      Catégorie
                      <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.category} onChange={(e) => updateRow(row.rowId, { category: e.target.value as MissionCategory })}>
                        {MISSION_CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-slate-700">
                      Etat DO
                      <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.do_status} onChange={(e) => updateRow(row.rowId, { do_status: e.target.value })} />
                    </label>
                    <label className="text-slate-700">
                      Retenue
                      <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.retained_status} onChange={(e) => updateRow(row.rowId, { retained_status: e.target.value })} />
                    </label>
                    <label className="text-slate-700">
                      Type source
                      <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.source_type_label} onChange={(e) => updateRow(row.rowId, { source_type_label: e.target.value })} />
                    </label>
                    <label className="text-slate-700">
                      Réversion
                      <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.reversion_expected} onChange={(e) => updateRow(row.rowId, { reversion_expected: e.target.value })} />
                    </label>
                    <label className="text-slate-700">
                      Réversion réelle
                      <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.reversion_actual} onChange={(e) => updateRow(row.rowId, { reversion_actual: e.target.value })} />
                    </label>
                    <label className="text-slate-700">
                      Validation
                      <input type="date" className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.validation_date} onChange={(e) => updateRow(row.rowId, { validation_date: e.target.value })} />
                    </label>
                    <label className="text-slate-700 md:col-span-2">
                      Nombre de secouristes
                      <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.requirements_notes} onChange={(e) => updateRow(row.rowId, { requirements_notes: e.target.value })} />
                    </label>
                    <label className="text-slate-700 md:col-span-2">
                      Matériel spécifique
                      <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={row.equipment_notes} onChange={(e) => updateRow(row.rowId, { equipment_notes: e.target.value })} />
                    </label>
                  </div> : null}

                  {row.issues.length > 0 ? (
                    <ul className="space-y-1 text-amber-700">
                      {row.issues.map((issue, index) => (
                        <li key={`${row.rowId}-warning-${index}`}>Warning: {issue}</li>
                      ))}
                    </ul>
                  ) : null}

                  {validation.errors.length > 0 ? (
                    <ul className="space-y-1 text-red-700">
                      {validation.errors.map((issue, index) => (
                        <li key={`${row.rowId}-error-${index}`}>Erreur: {issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-emerald-700">Ligne valide.</p>
                  )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRows([]);
                setFileName(null);
                setError(null);
                setSuccess(null);
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
