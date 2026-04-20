'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MissionImportPreviewItem,
  NormalizedMissionImport,
  buildMissionsPreview,
  parseCsvContent,
  parseParisLocalToUtcIso,
  utcIsoToParisParts
} from '@/lib/import-missions';
import { MISSION_CATEGORY_OPTIONS, MissionCategory, Profile } from '@/lib/types';
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
    category: 'maraude',
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

  const validMissions = useMemo(
    () => normalizedRows.filter((entry) => entry.result.normalized && entry.result.errors.length === 0).map((entry) => entry.result.normalized!),
    [normalizedRows]
  );

  const blockingErrors = useMemo(
    () => normalizedRows.reduce((count, entry) => count + entry.result.errors.length, 0),
    [normalizedRows]
  );

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

    if (validMissions.length === 0) {
      setError('Aucune mission valide à importer.');
      return;
    }

    if (blockingErrors > 0) {
      setError('Corrigez les lignes invalides ou supprimez-les avant de confirmer.');
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
        body: JSON.stringify({ missions: validMissions })
      });

      const payload = (await response.json()) as {
        error?: string;
        warning?: string;
        imported?: number;
        detected?: number;
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
        `Import terminé : ${payload.detected ?? validMissions.length} détectées, ${payload.imported ?? 0} importées, ${payload.failed ?? 0} en échec. Batch: ${payload.importBatchId ?? 'n/a'}.`
      );

      if (payload.warning) {
        setError(payload.warning);
      }
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
        {fileName ? <p className="mt-2 text-xs text-slate-500">Fichier sélectionné : {fileName}</p> : null}
      </div>

      {rows.length > 0 ? (
        <div className="space-y-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p>{rows.filter((row) => !row.deleted).length} lignes à relire</p>
            <p>{validMissions.length} lignes valides</p>
            <p>{blockingErrors} erreurs bloquantes</p>
          </div>

          <div className="space-y-3">
            {rows.map((row) => {
              if (row.deleted) {
                return null;
              }

              const validation = validateAndNormalizeRow(row);

              return (
                <article key={row.rowId} className="space-y-3 rounded-md border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-900">Bloc #{row.sourceBlockIndex + 1}</p>
                    <button
                      type="button"
                      className="text-xs text-red-700 underline"
                      onClick={() => updateRow(row.rowId, { deleted: true })}
                      disabled={importing}
                    >
                      Supprimer la ligne
                    </button>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
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
                  </div>

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
                </article>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || validMissions.length === 0 || blockingErrors > 0}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? 'Import en cours...' : `Confirmer l'import (${validMissions.length})`}
            </button>
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
