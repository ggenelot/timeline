'use client';

import { ChangeEvent, memo, useCallback, useEffect, useMemo, useState } from 'react';
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
import { getMissionCategory, MISSION_CATEGORY_LABELS, MISSION_TYPE_OPTIONS, MissionStatus, Profile } from '@/lib/types';
import { supabase } from '@/lib/supabase/client';
import { MissionCardShell } from '@/components/missions/mission-card-shell';
import { AdminBanner, AdminCard, AdminPageHeader, AdminSectionLabel, adminInputStyle, ghostButtonStyle, primaryButtonStyle, pillStyle } from '@/components/admin/ui';
import { Icon } from '@/components/ui/icon';

type ImportFilter = 'nouveau' | 'modifié' | 'doublon' | 'invalide';

const IMPORT_STATUS_LABELS: Record<ImportFilter, string> = {
  nouveau: 'Nouveau',
  modifié: 'Modifié',
  doublon: 'Doublon',
  invalide: 'Invalide'
};

const IMPORT_STATUS_BADGE: Record<ImportFilter, string> = {
  nouveau: 'bg-ok-soft text-ok-text ring-1 ring-inset ring-ok-line',
  modifié: 'bg-warn-soft text-warn-text ring-1 ring-inset ring-warn-line',
  doublon: 'bg-surface-sub text-ink-2 ring-1 ring-inset ring-line',
  invalide: 'bg-bad-soft text-bad ring-1 ring-inset ring-bad/30'
};

const IMPORT_STATUS_CARD: Record<ImportFilter, string> = {
  nouveau: '',
  modifié: 'border-warn-line bg-warn-soft/60',
  doublon: 'border-line bg-surface-sub/70',
  invalide: 'border-bad/30 bg-bad-soft/65'
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
  mission_type_id: string;
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
      mission_type_id: item.normalized.mission_type_id,
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
    mission_type_id: 'aaaaaaaa-0000-0000-0000-000000000005',
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
      mission_type_id: row.mission_type_id,
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

const PAGE_SIZE = 25;

type MissionImportRowProps = {
  row: EditableImportRow;
  rowStatus: ImportFilter;
  importing: boolean;
  checkingDuplicates: boolean;
  onCommitEdit: (rowId: string, patch: Partial<EditableImportRow>) => void;
  onDelete: (rowId: string) => void;
  onImportSingle: (mission: NormalizedMissionImport) => void;
};

// Each card manages its own edit draft so typing doesn't trigger parent re-renders or global revalidation.
const MissionImportRow = memo(function MissionImportRow({
  row,
  rowStatus,
  importing,
  checkingDuplicates,
  onCommitEdit,
  onDelete,
  onImportSingle,
}: MissionImportRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<EditableImportRow>>({});

  const liveRow = useMemo(() => ({ ...row, ...draft }), [row, draft]);
  const liveValidation = useMemo(() => validateAndNormalizeRow(liveRow), [liveRow]);
  const normalizedMission = liveValidation.normalized;
  const isImportable = rowStatus === 'nouveau' && normalizedMission !== null && liveValidation.errors.length === 0;

  function handleToggleEdit() {
    if (isEditing && Object.keys(draft).length > 0) {
      onCommitEdit(row.rowId, draft);
      setDraft({});
    }
    setIsEditing((prev: boolean) => !prev);
  }

  function updateDraft(patch: Partial<EditableImportRow>) {
    setDraft((prev: Partial<EditableImportRow>) => ({ ...prev, ...patch }));
  }

  return (
    <MissionCardShell
      className={IMPORT_STATUS_CARD[rowStatus]}
      headerLeft={
        <>
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${IMPORT_STATUS_BADGE[rowStatus]}`}>
            {IMPORT_STATUS_LABELS[rowStatus]}
          </span>
          <span className="text-ink-4">|</span>
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${MISSION_CATEGORY_BADGE_CLASSES[getMissionCategory(liveRow.mission_type_id)] ?? 'bg-amber-400 text-slate-900'}`}>
            {MISSION_CATEGORY_LABELS[getMissionCategory(liveRow.mission_type_id)]}
          </span>
        </>
      }
      headerRight={
        <span className="text-xs text-ink-4">Bloc #{row.sourceBlockIndex + 1}</span>
      }
      title={liveRow.title || 'Sans intitulé'}
      metadata={
        <>{liveRow.date || '-'} | {liveRow.startTime || '-'} à {liveRow.endTime || '-'}</>
      }
      location={<>Lieu : {liveRow.location || '-'}</>}
      description={
        <div className="grid gap-x-4 gap-y-1 text-ink-2 md:grid-cols-2">
          <p><span className="font-medium text-ink">Etat DO :</span> {liveRow.do_status || '-'}</p>
          <p><span className="font-medium text-ink">Retenue :</span> {liveRow.retained_status || '-'}</p>
          <p><span className="font-medium text-ink">Type source :</span> {liveRow.source_type_label || '-'}</p>
          <p><span className="font-medium text-ink">Réversion :</span> {liveRow.reversion_expected || '-'}</p>
          <p><span className="font-medium text-ink">Réversion réelle :</span> {liveRow.reversion_actual || '-'}</p>
          <p><span className="font-medium text-ink">Validation :</span> {liveRow.validation_date || '-'}</p>
          <p className="md:col-span-2"><span className="font-medium text-ink">Nombre de secouristes :</span> {liveRow.requirements_notes || '-'}</p>
          <p className="md:col-span-2"><span className="font-medium text-ink">Matériel spécifique :</span> {liveRow.equipment_notes || '-'}</p>
        </div>
      }
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[9px] border border-line-field bg-surface-card px-3 py-1 text-xs font-semibold text-ink-2 hover:bg-surface-sub"
            onClick={handleToggleEdit}
            disabled={importing}
          >
            <Icon name={isEditing ? 'close' : 'edit'} size={15} />
            {isEditing ? 'Fermer' : 'Éditer'}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[9px] border border-bad/30 bg-surface-card px-3 py-1 text-xs font-semibold text-bad hover:bg-bad-soft"
            onClick={() => onDelete(row.rowId)}
            disabled={importing}
          >
            <Icon name="delete" size={15} />
            Supprimer
          </button>
          {rowStatus === 'nouveau' ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-[9px] border border-ok-line bg-surface-card px-3 py-1 text-xs font-semibold text-ok-text hover:bg-ok-soft disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                if (normalizedMission) {
                  onImportSingle(normalizedMission);
                }
              }}
              disabled={importing || checkingDuplicates || !isImportable}
            >
              <Icon name="check" size={15} />
              Importer
            </button>
          ) : null}
        </div>
      }
      footer={
        <>
          {isEditing ? (
            <div className="grid gap-2 md:grid-cols-2">
              <label className="text-sm font-semibold text-ink-2">
                Intitulé *
                <input className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.title} onChange={(e) => updateDraft({ title: e.target.value })} />
              </label>
              <label className="text-sm font-semibold text-ink-2">
                Lieu
                <input className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.location} onChange={(e) => updateDraft({ location: e.target.value })} />
              </label>
              <label className="text-sm font-semibold text-ink-2">
                Date *
                <input type="date" className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.date} onChange={(e) => updateDraft({ date: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-semibold text-ink-2">
                  Début *
                  <input type="time" className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.startTime} onChange={(e) => updateDraft({ startTime: e.target.value })} />
                </label>
                <label className="text-sm font-semibold text-ink-2">
                  Fin *
                  <input type="time" className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.endTime} onChange={(e) => updateDraft({ endTime: e.target.value })} />
                </label>
              </div>
              <label className="text-sm font-semibold text-ink-2">
                Catégorie
                <select className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.mission_type_id} onChange={(e) => updateDraft({ mission_type_id: e.target.value })}>
                  {MISSION_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-ink-2">
                Etat DO
                <input className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.do_status} onChange={(e) => updateDraft({ do_status: e.target.value })} />
              </label>
              <label className="text-sm font-semibold text-ink-2">
                Retenue
                <input className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.retained_status} onChange={(e) => updateDraft({ retained_status: e.target.value })} />
              </label>
              <label className="text-sm font-semibold text-ink-2">
                Type source
                <input className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.source_type_label} onChange={(e) => updateDraft({ source_type_label: e.target.value })} />
              </label>
              <label className="text-sm font-semibold text-ink-2">
                Réversion
                <input className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.reversion_expected} onChange={(e) => updateDraft({ reversion_expected: e.target.value })} />
              </label>
              <label className="text-sm font-semibold text-ink-2">
                Réversion réelle
                <input className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.reversion_actual} onChange={(e) => updateDraft({ reversion_actual: e.target.value })} />
              </label>
              <label className="text-sm font-semibold text-ink-2">
                Validation
                <input type="date" className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.validation_date} onChange={(e) => updateDraft({ validation_date: e.target.value })} />
              </label>
              <label className="text-sm font-semibold text-ink-2 md:col-span-2">
                Nombre de secouristes
                <input className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.requirements_notes} onChange={(e) => updateDraft({ requirements_notes: e.target.value })} />
              </label>
              <label className="text-sm font-semibold text-ink-2 md:col-span-2">
                Matériel spécifique
                <input className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.equipment_notes} onChange={(e) => updateDraft({ equipment_notes: e.target.value })} />
              </label>
            </div>
          ) : null}

          {liveRow.issues.length > 0 ? (
            <ul className={`space-y-1 rounded-[10px] border border-warn-line bg-warn-soft p-3 text-xs text-warn-text ${isEditing ? 'mt-3' : ''}`}>
              {liveRow.issues.map((issue, index) => (
                <li key={`${row.rowId}-warning-${index}`}>Warning: {issue}</li>
              ))}
            </ul>
          ) : null}

          {liveValidation.errors.length > 0 ? (
            <ul className={`space-y-1 rounded-[10px] border border-bad/30 bg-bad-soft p-3 text-xs text-bad ${isEditing || liveRow.issues.length > 0 ? 'mt-3' : ''}`}>
              {liveValidation.errors.map((issue, index) => (
                <li key={`${row.rowId}-error-${index}`}>Erreur: {issue}</li>
              ))}
            </ul>
          ) : rowStatus === 'nouveau' && !isEditing ? (
            <p className="text-xs text-ok-text">Ligne valide.</p>
          ) : null}
        </>
      }
    />
  );
});

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
  const [loadingFromGoogleSheet, setLoadingFromGoogleSheet] = useState(false);
  const [importStatus, setImportStatus] = useState<Extract<MissionStatus, 'draft' | 'proposed'>>('draft');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ImportFilter>('nouveau');
  const [page, setPage] = useState(0);

  useEffect(() => {
    async function loadProfile() {
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        router.replace('/login');
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id,full_name,email,role,sector,created_at')
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

  // Reset pagination when filter or search changes
  useEffect(() => {
    setPage(0);
  }, [activeFilter, searchQuery]);

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

  // Derive stable primitive range strings so the DB query only re-fires when dates change,
  // not on every field edit (title, location, etc.).
  const [missionsRangeStart, missionsRangeEnd] = useMemo(() => {
    if (validMissionEntries.length === 0) return [null, null] as const;
    const starts = validMissionEntries.map((e) => e.mission.starts_at);
    return [
      starts.reduce((min, s) => (s < min ? s : min), starts[0]),
      starts.reduce((max, s) => (s > max ? s : max), starts[0]),
    ] as const;
  }, [validMissionEntries]);

  useEffect(() => {
    if (!missionsRangeStart || !missionsRangeEnd) {
      setExistingMissionsMap(new Map());
      setDuplicateCheckError(null);
      setCheckingDuplicates(false);
      return;
    }

    let cancelled = false;

    async function loadExistingMissions() {
      setCheckingDuplicates(true);
      setDuplicateCheckError(null);

      const { data, error: queryError } = await supabase
        .from('missions')
        .select('id,title,starts_at,ends_at,location')
        .gte('starts_at', missionsRangeStart!)
        .lte('starts_at', missionsRangeEnd!);

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
  }, [missionsRangeStart, missionsRangeEnd]);

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

  const totalPages = Math.ceil(visibleRows.length / PAGE_SIZE);
  const paginatedRows = useMemo(() => visibleRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [visibleRows, page]);

  const handleCommitEdit = useCallback((rowId: string, patch: Partial<EditableImportRow>) => {
    setRows((previous) => previous.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  }, []);

  const handleDeleteRow = useCallback((rowId: string) => {
    setRows((previous) => previous.map((row) => (row.rowId === rowId ? { ...row, deleted: true } : row)));
  }, []);

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
    setPage(0);
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
        body: JSON.stringify({ missions: dedupAnalysis.readyMissions, importStatus })
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
      setPage(0);
      setSuccess('Import depuis Google Sheet chargé.');
    } finally {
      setLoadingFromGoogleSheet(false);
    }
  }

  const importSingleMission = useCallback(async (mission: NormalizedMissionImport) => {
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
  }, [importStatus]);

  if (loadingProfile) {
    return <p style={{ fontSize: 14, color: '#5B6478' }}>Chargement…</p>;
  }

  if (!profile || profile.role !== 'admin') {
    return <AdminBanner tone="error">Accès refusé : page réservée aux admins.</AdminBanner>;
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <AdminPageHeader
        title="Importer des missions"
        subtitle="Importez des missions depuis un fichier (.csv, .xlsx, .xls) ou un Google Sheet public, vérifiez, corrigez puis enregistrez."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error ? <AdminBanner tone="error">{error}</AdminBanner> : null}
        {success ? <AdminBanner tone="success">{success}</AdminBanner> : null}

        <AdminCard padding="18px 22px">
          <AdminSectionLabel style={{ marginBottom: 11 }}>Fichier (.csv, .xlsx, .xls)</AdminSectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              disabled={analyzing || importing}
              className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface-sub px-3 py-2 text-sm text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-engage file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-engage-hover"
            />
            <button
              type="button"
              onClick={handleImportFromGoogleSheet}
              disabled={analyzing || importing || loadingFromGoogleSheet}
              style={{ ...ghostButtonStyle, ...(analyzing || importing || loadingFromGoogleSheet ? { opacity: 0.55, cursor: 'not-allowed' } : null) }}
            >
              {loadingFromGoogleSheet ? 'Chargement du Google Sheet…' : 'Importer depuis Google Sheet public'}
            </button>
          </div>
          {fileName ? <p style={{ margin: '10px 0 0', fontSize: 12, color: '#8A93A6' }}>Fichier sélectionné : <span style={{ fontWeight: 700, color: '#5B6478' }}>{fileName}</span></p> : null}
        </AdminCard>

      {rows.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AdminCard padding="18px 22px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="search"
                aria-label="Rechercher une mission"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Rechercher une mission"
                style={adminInputStyle}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(['nouveau', 'modifié', 'doublon', 'invalide'] as ImportFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    style={pillStyle(activeFilter === filter)}
                  >
                    {IMPORT_STATUS_LABELS[filter]} {filterCounts[filter]}
                  </button>
                ))}
              </div>
              {checkingDuplicates ? <p style={{ margin: 0, fontSize: 12, color: '#8A93A6' }}>Vérification des doublons en base en cours…</p> : null}
              {duplicateCheckError ? <p style={{ margin: 0, fontSize: 12, color: '#B45309' }}>{duplicateCheckError}</p> : null}
            </div>
          </AdminCard>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || dedupAnalysis.readyMissions.length === 0 || checkingDuplicates}
              style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6, ...(importing || dedupAnalysis.readyMissions.length === 0 || checkingDuplicates ? { opacity: 0.55, cursor: 'not-allowed' } : null) }}
            >
              <Icon name="upload" size={18} />
              {importing ? 'Import en cours…' : `Importer toutes les nouvelles missions (${dedupAnalysis.readyMissions.length})`}
            </button>
            <button
              type="button"
              onClick={handleUpdateModified}
              disabled={importing || dedupAnalysis.modifiedMissions.length === 0 || checkingDuplicates}
              style={{ cursor: 'pointer', border: 'none', background: '#B45309', color: '#fff', borderRadius: 11, padding: '10px 18px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', ...(importing || dedupAnalysis.modifiedMissions.length === 0 || checkingDuplicates ? { opacity: 0.55, cursor: 'not-allowed' } : null) }}
            >
              {importing ? 'Mise à jour en cours…' : `Mettre à jour les missions modifiées (${dedupAnalysis.modifiedMissions.length})`}
            </button>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, border: '1px solid #E6EAF2', background: '#fff', borderRadius: 11, padding: '8px 12px', boxShadow: '0 6px 18px -12px rgba(20,32,58,.2)' }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#8A93A6' }}>Statut import</span>
              <div style={{ display: 'inline-flex', border: '1px solid #E6EAF2', background: '#F7F9FC', borderRadius: 999, padding: 2 }}>
                <button
                  type="button"
                  onClick={() => setImportStatus('draft')}
                  disabled={importing}
                  style={{ cursor: 'pointer', border: 'none', borderRadius: 999, padding: '5px 13px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', background: importStatus === 'draft' ? '#fff' : 'transparent', color: importStatus === 'draft' ? '#16203A' : '#5B6478', boxShadow: importStatus === 'draft' ? '0 1px 2px rgba(20,32,58,.12)' : 'none' }}
                >
                  Brouillon
                </button>
                <button
                  type="button"
                  onClick={() => setImportStatus('proposed')}
                  disabled={importing}
                  style={{ cursor: 'pointer', border: 'none', borderRadius: 999, padding: '5px 13px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', background: importStatus === 'proposed' ? '#E9F7EF' : 'transparent', color: importStatus === 'proposed' ? '#12805A' : '#5B6478', boxShadow: importStatus === 'proposed' ? '0 1px 2px rgba(20,32,58,.12)' : 'none' }}
                >
                  Proposé
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {paginatedRows.map((row) => {
              const rowStatus = rowStatuses.get(row.rowId) ?? 'invalide';
              return (
                <MissionImportRow
                  key={row.rowId}
                  row={row}
                  rowStatus={rowStatus}
                  importing={importing}
                  checkingDuplicates={checkingDuplicates}
                  onCommitEdit={handleCommitEdit}
                  onDelete={handleDeleteRow}
                  onImportSingle={importSingleMission}
                />
              );
            })}

            {visibleRows.length === 0 ? (
              <div style={{ textAlign: 'center', background: '#fff', border: '1.5px dashed #DCE2EC', borderRadius: 16, padding: '36px 24px', fontSize: 13.5, color: '#8A93A6' }}>
                Aucune mission avec le filtre &quot;{IMPORT_STATUS_LABELS[activeFilter]}&quot;
                {searchQuery.trim() ? ` et la recherche "${searchQuery}"` : ''}.
              </div>
            ) : null}

            {totalPages > 1 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{ ...ghostButtonStyle, ...(page === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : null) }}
                >
                  ← Précédent
                </button>
                <span style={{ fontSize: 13, color: '#5B6478' }}>
                  Page {page + 1} / {totalPages} ({visibleRows.length} missions)
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  style={{ ...ghostButtonStyle, ...(page >= totalPages - 1 ? { opacity: 0.45, cursor: 'not-allowed' } : null) }}
                >
                  Suivant →
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setRows([]);
                setFileName(null);
                setError(null);
                setSuccess(null);
                setSearchQuery('');
                setActiveFilter('nouveau');
                setPage(0);
              }}
              disabled={importing}
              style={{ ...ghostButtonStyle, ...(importing ? { opacity: 0.55, cursor: 'not-allowed' } : null) }}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
