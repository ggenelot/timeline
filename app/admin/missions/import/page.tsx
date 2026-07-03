'use client';

import { ChangeEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  buildMissionDedupKey,
  getMissionDateForDedupFromStartsAt,
  inferMaterielNeedsFromNotes,
  inferSkillNeedsFromNotes,
  MissionImportApiPayload,
  MissionImportPreviewItem,
  NormalizedMissionImport,
  buildMissionsPreview,
  parseCsvContent,
  parseParisLocalToUtcIso,
  utcIsoToParisParts
} from '@/lib/import-missions';
import { getMissionCategory, MISSION_CATEGORY_LABELS, MISSION_TYPE_OPTIONS, MissionStatus, Profile } from '@/lib/types';
import { supabase } from '@/lib/supabase/client';
import { AdminBanner, AdminCard, AdminSectionLabel, ghostButtonStyle } from '@/components/admin/ui';
import { Icon } from '@/components/ui/icon';
import { getSkillColorClass } from '@/components/skills/skill-badge';
import { ImportQuickPicker } from '@/components/missions/import-quick-picker';
import { GENERIC_VOLUNTEER_LABEL } from '@/components/missions/mission-requirements-editor';

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

// Seul "Nouveau" porte un accent (vert) dans la maquette ; les 3 autres filtres restent neutres
// même actifs. Le filtre actif se distingue par un anneau, et remplace l'ancien toggle
// "masquer les doublons" (redondant avec le filtre Doublon).
const IMPORT_FILTER_TONE: Record<ImportFilter, string> = {
  nouveau: 'border-ok-line bg-ok-soft text-ok-text',
  modifié: 'border-line bg-white text-ink-2',
  doublon: 'border-line bg-white text-ink-2',
  invalide: 'border-line bg-white text-ink-2'
};

const MISSION_CATEGORY_BADGE_CLASSES: Record<string, string> = {
  poste_de_secours: 'bg-orange-400 text-slate-900',
  garde: 'bg-red-500 text-white',
  formation: 'bg-blue-900 text-white',
  maraude: 'bg-violet-500 text-white',
  vie_antenne: 'bg-sky-400 text-slate-900'
};

type SkillOption = { id: string; name: string; code?: string | null };
type MaterielOption = { id: string; name: string };

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
  // Besoins définis dans le flux d'import (éditeurs à pastilles) : clé = skill_id
  // ('' = bénévole générique) / category_id → quantité.
  needs: Record<string, number>;
  materiel: Record<string, number>;
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

function sumQuantities(map: Record<string, number>): number {
  return Object.values(map).reduce((sum, quantity) => sum + quantity, 0);
}

function normalizeEditableRow(
  item: MissionImportPreviewItem,
  index: number,
  skills: SkillOption[],
  materiels: MaterielOption[]
): EditableImportRow {
  const rawPayload = item.block.rawPairs.reduce<Record<string, string | null>>((acc, pair) => {
    acc[pair.label] = pair.value || null;
    return acc;
  }, {});

  const requirementsNotes = item.normalized?.requirements_notes ?? item.block.values.requirements_notes ?? '';
  const equipmentNotes = item.normalized?.equipment_notes ?? item.block.values.equipment_notes ?? '';
  const needs = inferSkillNeedsFromNotes(requirementsNotes, skills);
  const materiel = inferMaterielNeedsFromNotes(equipmentNotes, materiels);

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
      issues: item.issues.map((issue) => issue.message),
      needs,
      materiel
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
    issues: item.issues.map((issue) => issue.message),
    needs,
    materiel
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
  const needsTotal = sumQuantities(row.needs);

  return {
    normalized: {
      sourceBlockIndex: row.sourceBlockIndex,
      title: row.title.trim(),
      location: row.location.trim() || null,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      required_volunteers: needsTotal > 0 ? needsTotal : inferRequiredVolunteersFromNotes(row.requirements_notes),
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

function toImportApiPayload(row: EditableImportRow, mission: NormalizedMissionImport): MissionImportApiPayload {
  return {
    ...mission,
    required_skills: Object.entries(row.needs)
      .filter(([, quantity]) => quantity > 0)
      .map(([skillId, quantity]) => ({ skill_id: skillId || null, quantity })),
    required_materiels: Object.entries(row.materiel)
      .filter(([, quantity]) => quantity > 0)
      .map(([categoryId, quantity]) => ({ category_id: categoryId, quantity }))
  };
}

function stripDiacriticsLower(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function doStatusTone(doStatus: string): 'slate' | 'rose' | 'blue' {
  if (!doStatus.trim()) {
    return 'slate';
  }
  return stripDiacriticsLower(doStatus).includes('urgent') ? 'rose' : 'blue';
}

function formatRelativeSync(date: Date | null, nowMs: number): string {
  if (!date) {
    return '';
  }

  const diffMin = Math.max(0, Math.round((nowMs - date.getTime()) / 60000));
  if (diffMin < 1) {
    return "à l'instant";
  }
  if (diffMin < 60) {
    return `il y a ${diffMin} min`;
  }
  return `il y a ${Math.round(diffMin / 60)} h`;
}

function buildBadgeSummary(
  map: Record<string, number>,
  options: Array<{ id: string; name: string }>,
  genericLabel: string
): Array<{ id: string; label: string; quantity: number }> {
  return Object.entries(map)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => ({
      id,
      label: id ? options.find((option) => option.id === id)?.name ?? 'Compétence' : genericLabel,
      quantity
    }));
}

function SummaryPill({ label, quantity, tone }: { label: string; quantity: number; tone: 'violet' | 'sky' }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-semibold ${getSkillColorClass(tone)}`}>
      {label} · {quantity}
    </span>
  );
}

const TABLE_GRID_CLASS = 'grid grid-cols-[90px_1.6fr_1fr_1fr_0.9fr_0.9fr_1.3fr_130px] items-center gap-3';

const PAGE_SIZE = 25;

type MissionImportRowProps = {
  row: EditableImportRow;
  rowStatus: ImportFilter;
  importing: boolean;
  checkingDuplicates: boolean;
  skills: SkillOption[];
  materiels: MaterielOption[];
  onCommitEdit: (rowId: string, patch: Partial<EditableImportRow>) => void;
  onDelete: (rowId: string) => void;
  onImportSingle: (row: EditableImportRow, mission: NormalizedMissionImport) => void;
  onAddNeed: (rowId: string, skillId: string) => void;
  onRemoveNeed: (rowId: string, skillId: string) => void;
  onAddMateriel: (rowId: string, categoryId: string) => void;
  onRemoveMateriel: (rowId: string, categoryId: string) => void;
};

// Each row manages its own edit draft/expanded state so typing doesn't trigger parent re-renders.
const MissionImportRow = memo(function MissionImportRow({
  row,
  rowStatus,
  importing,
  checkingDuplicates,
  skills,
  materiels,
  onCommitEdit,
  onDelete,
  onImportSingle,
  onAddNeed,
  onRemoveNeed,
  onAddMateriel,
  onRemoveMateriel
}: MissionImportRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<EditableImportRow>>({});

  const liveRow = useMemo(() => ({ ...row, ...draft }), [row, draft]);
  const liveValidation = useMemo(() => validateAndNormalizeRow(liveRow), [liveRow]);
  const normalizedMission = liveValidation.normalized;
  const isImportable = rowStatus === 'nouveau' && normalizedMission !== null && liveValidation.errors.length === 0;

  function handleToggleEdit(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    if (isEditing && Object.keys(draft).length > 0) {
      onCommitEdit(row.rowId, draft);
      setDraft({});
    }
    if (!isEditing) {
      setExpanded(true);
    }
    setIsEditing((prev) => !prev);
  }

  function updateDraft(patch: Partial<EditableImportRow>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  const skillOptions = useMemo(
    () => [{ id: '', label: GENERIC_VOLUNTEER_LABEL }, ...skills.map((skill) => ({ id: skill.id, label: skill.name }))],
    [skills]
  );
  const materielOptions = useMemo(() => materiels.map((materiel) => ({ id: materiel.id, label: materiel.name })), [materiels]);

  const needsSummary = useMemo(() => buildBadgeSummary(row.needs, skills, 'Bénévole'), [row.needs, skills]);
  const materielSummary = useMemo(() => buildBadgeSummary(row.materiel, materiels, 'Matériel'), [row.materiel, materiels]);

  const category = getMissionCategory(liveRow.mission_type_id);

  return (
    <div className="border-b border-line-row last:border-b-0">
      <div
        className={`${TABLE_GRID_CLASS} cursor-pointer px-5 py-3.5 hover:bg-surface-sub/60`}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${IMPORT_STATUS_BADGE[rowStatus]}`}>{IMPORT_STATUS_LABELS[rowStatus]}</span>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${MISSION_CATEGORY_BADGE_CLASSES[category] ?? 'bg-amber-400'}`} />
            <span className="truncate text-[14.5px] font-bold text-ink">{liveRow.title || 'Sans intitulé'}</span>
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-3">{MISSION_CATEGORY_LABELS[category]}</div>
        </div>

        <div className="text-[13px] text-ink-2">
          {liveRow.date || '—'}
          <div className="text-xs text-ink-3">{liveRow.startTime || '—'} – {liveRow.endTime || '—'}</div>
        </div>

        <div className="truncate text-[13px] text-ink-2">{liveRow.location || '—'}</div>

        <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-bold ${getSkillColorClass(doStatusTone(liveRow.do_status))}`}>
          {liveRow.do_status || '—'}
        </span>

        <div className="text-[13.5px] font-semibold text-ink">{liveRow.reversion_expected ? `${liveRow.reversion_expected} €` : '—'}</div>

        <div className="flex flex-wrap gap-1.5">
          {needsSummary.map((entry) => (
            <SummaryPill key={`need-${entry.id || 'generic'}`} label={entry.label} quantity={entry.quantity} tone="violet" />
          ))}
          {materielSummary.map((entry) => (
            <SummaryPill key={`mat-${entry.id}`} label={entry.label} quantity={entry.quantity} tone="sky" />
          ))}
          {needsSummary.length === 0 && materielSummary.length === 0 ? <span className="text-xs text-ink-4">—</span> : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-line-field bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-sub"
            onClick={handleToggleEdit}
            disabled={importing}
          >
            <Icon name={isEditing ? 'close' : 'edit'} size={14} />
            {isEditing ? 'Fermer' : 'Éditer'}
          </button>
          {rowStatus === 'nouveau' ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg bg-ok-bar px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={(event) => {
                event.stopPropagation();
                if (normalizedMission) {
                  onImportSingle(row, normalizedMission);
                }
              }}
              disabled={importing || checkingDuplicates || !isImportable}
            >
              <Icon name="check" size={14} />
              Importer
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center rounded-lg border border-bad/30 bg-white p-1.5 text-bad hover:bg-bad-soft"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(row.rowId);
            }}
            disabled={importing}
            title="Retirer cette ligne de l'import"
          >
            <Icon name="delete" size={14} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="bg-[#fbfcfe] px-5 pb-6 pt-1">
          {isEditing ? (
            <div className="mb-4 grid gap-2 rounded-xl border border-line-row bg-white p-4 md:grid-cols-2">
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
                Nombre de secouristes (note libre source)
                <input className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.requirements_notes} onChange={(e) => updateDraft({ requirements_notes: e.target.value })} />
              </label>
              <label className="text-sm font-semibold text-ink-2 md:col-span-2">
                Matériel spécifique (note libre source)
                <input className="mt-1 w-full rounded-[10px] border border-line-field bg-surface-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring" value={liveRow.equipment_notes} onChange={(e) => updateDraft({ equipment_notes: e.target.value })} />
              </label>
            </div>
          ) : null}

          <div className="grid gap-5 pt-1 md:grid-cols-2">
            <ImportQuickPicker
              title="Besoins en bénévoles"
              options={skillOptions}
              selected={row.needs}
              onAdd={(skillId) => onAddNeed(row.rowId, skillId)}
              onRemove={(skillId) => onRemoveNeed(row.rowId, skillId)}
              tone="violet"
              disabled={importing}
              emptyLabel={GENERIC_VOLUNTEER_LABEL}
            />
            <ImportQuickPicker
              title="Matériel requis"
              options={materielOptions}
              selected={row.materiel}
              onAdd={(categoryId) => onAddMateriel(row.rowId, categoryId)}
              onRemove={(categoryId) => onRemoveMateriel(row.rowId, categoryId)}
              tone="sky"
              disabled={importing}
              emptyLabel="Matériel"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-6 border-t border-line-row pt-3.5 text-[13px] text-ink-2">
            <span><strong className="text-ink">Réversion réelle :</strong> {liveRow.reversion_actual || '—'}</span>
            <span><strong className="text-ink">Retenue :</strong> {liveRow.retained_status || '—'}</span>
            <span><strong className="text-ink">Validation :</strong> {liveRow.validation_date || '—'}</span>
            {liveValidation.errors.length === 0 ? <span className="ml-auto font-semibold text-ok-text">✓ Ligne valide</span> : null}
          </div>

          {liveRow.issues.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded-[10px] border border-warn-line bg-warn-soft p-3 text-xs text-warn-text">
              {liveRow.issues.map((issue, index) => (
                <li key={`${row.rowId}-warning-${index}`}>Warning: {issue}</li>
              ))}
            </ul>
          ) : null}

          {liveValidation.errors.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded-[10px] border border-bad/30 bg-bad-soft p-3 text-xs text-bad">
              {liveValidation.errors.map((issue, index) => (
                <li key={`${row.rowId}-error-${index}`}>Erreur: {issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

export default function AdminMissionImportPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<'file' | 'sheet' | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
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
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [materiels, setMateriels] = useState<MaterielOption[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    async function loadCatalog() {
      const [skillsResult, materielsResult] = await Promise.all([
        supabase.from('skills').select('id,name,code').order('name', { ascending: true }),
        supabase.from('materiel_categories').select('id,name').order('display_order', { ascending: true })
      ]);

      if (!skillsResult.error) {
        setSkills((skillsResult.data ?? []).map((s) => ({ id: s.id, name: s.name, code: s.code ?? null })));
      }
      if (!materielsResult.error) {
        setMateriels((materielsResult.data ?? []).map((m) => ({ id: m.id, name: m.name })));
      }
      setLoadingCatalog(false);
    }

    void loadCatalog();
  }, []);

  // Rafraîchit le texte relatif de synchro ("il y a X min") sans re-fetch.
  useEffect(() => {
    if (!lastSyncedAt) return;
    const interval = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [lastSyncedAt]);

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
    const readyMissions: Array<{ row: EditableImportRow; mission: NormalizedMissionImport }> = [];
    const modifiedMissions: Array<{ id: string; row: EditableImportRow; mission: NormalizedMissionImport }> = [];
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
          modifiedMissions.push({ id: existingMission.id, row, mission });
        }
      } else {
        readyMissions.push({ row, mission });
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

  const handleAddNeed = useCallback((rowId: string, skillId: string) => {
    setRows((previous) => previous.map((row) => (row.rowId === rowId ? { ...row, needs: { ...row.needs, [skillId]: (row.needs[skillId] ?? 0) + 1 } } : row)));
  }, []);

  const handleRemoveNeed = useCallback((rowId: string, skillId: string) => {
    setRows((previous) =>
      previous.map((row) => {
        if (row.rowId !== rowId) return row;
        const nextNeeds = { ...row.needs };
        delete nextNeeds[skillId];
        return { ...row, needs: nextNeeds };
      })
    );
  }, []);

  const handleAddMateriel = useCallback((rowId: string, categoryId: string) => {
    setRows((previous) => previous.map((row) => (row.rowId === rowId ? { ...row, materiel: { ...row.materiel, [categoryId]: (row.materiel[categoryId] ?? 0) + 1 } } : row)));
  }, []);

  const handleRemoveMateriel = useCallback((rowId: string, categoryId: string) => {
    setRows((previous) =>
      previous.map((row) => {
        if (row.rowId !== rowId) return row;
        const nextMateriel = { ...row.materiel };
        delete nextMateriel[categoryId];
        return { ...row, materiel: nextMateriel };
      })
    );
  }, []);

  function loadRowsFromCsv(content: string) {
    const parsedRows = parseCsvContent(content);
    const preview = buildMissionsPreview(parsedRows);
    setRows(preview.items.map((item, index) => normalizeEditableRow(item, index, skills, materiels)));
    setActiveFilter('nouveau');
    setSearchQuery('');
    setPage(0);
    setLastSyncedAt(new Date());
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(null);

    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setAnalyzing(true);
    setFileName(file.name);
    setSourceKind('file');

    const lowerName = file.name.toLowerCase();
    const isCsv = lowerName.endsWith('.csv');

    if (!isCsv) {
      setError('Cette V1 accepte uniquement les fichiers .csv dans cet environnement.');
      setAnalyzing(false);
      return;
    }

    const content = await file.text();
    loadRowsFromCsv(content);
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
        body: JSON.stringify({
          missions: dedupAnalysis.readyMissions.map(({ row, mission }) => toImportApiPayload(row, mission)),
          importStatus
        })
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
        body: JSON.stringify({
          missions: dedupAnalysis.modifiedMissions.map(({ id, row, mission }) => ({ id, mission: toImportApiPayload(row, mission) }))
        })
      });

      const payload = (await response.json()) as {
        error?: string;
        warning?: string;
        updated?: number;
        failed?: number;
      };

      if (!response.ok) {
        setError(payload.error ?? 'Mise à jour impossible.');
        return;
      }

      setSuccess(`Mise à jour terminée : ${payload.updated ?? 0} mission(s) mise(s) à jour, ${payload.failed ?? 0} en échec.`);

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

      loadRowsFromCsv(payload.content);
      setFileName(payload.fileName ?? 'google-sheet-public.csv');
      setSourceKind('sheet');
      setSuccess('Import depuis Google Sheet chargé.');
    } finally {
      setLoadingFromGoogleSheet(false);
    }
  }

  const importSingleMission = useCallback(async (row: EditableImportRow, mission: NormalizedMissionImport) => {
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
        body: JSON.stringify({ missions: [toImportApiPayload(row, mission)], importStatus })
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

  const totalLoadedCount = rows.filter((row) => !row.deleted).length;
  const sourceBusy = analyzing || importing || loadingFromGoogleSheet || loadingCatalog;

  return (
    <div className="mx-auto max-w-[1240px] pb-20">
      <div className="mb-7">
        <h1 className="m-0 text-[28px] font-extrabold tracking-tight text-ink">Importer des missions</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Importez des missions depuis un fichier (.csv) ou un Google Sheet public, vérifiez, corrigez, définissez les besoins puis enregistrez.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {error ? <AdminBanner tone="error">{error}</AdminBanner> : null}
        {success ? <AdminBanner tone="success">{success}</AdminBanner> : null}

        <AdminCard padding="22px 24px">
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} disabled={sourceBusy} className="hidden" />

          {totalLoadedCount > 0 && fileName ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <AdminSectionLabel>Source</AdminSectionLabel>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sourceBusy}
                  className="flex items-center gap-2 rounded-[10px] border border-line-field bg-surface-sub px-3.5 py-2 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                  title="Changer de fichier"
                >
                  <span className="h-4 w-4 rounded-[4px] bg-[#16a34a]" />
                  <span className="text-[13.5px] font-semibold text-ink">{fileName}</span>
                </button>
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ok-text">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#16a34a] text-[10px] text-white">✓</span>
                  {totalLoadedCount} ligne{totalLoadedCount > 1 ? 's' : ''} chargée{totalLoadedCount > 1 ? 's' : ''}
                  {lastSyncedAt ? ` · synchro ${formatRelativeSync(lastSyncedAt, nowTick)}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={handleImportFromGoogleSheet}
                disabled={sourceBusy || sourceKind !== 'sheet'}
                title={sourceKind === 'sheet' ? 'Resynchroniser depuis Google Sheet' : 'Disponible uniquement pour une source Google Sheet'}
                className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-line-field bg-white text-ink-2 hover:bg-surface-sub disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="sync" size={17} />
              </button>
            </div>
          ) : (
            <>
              <AdminSectionLabel style={{ marginBottom: 11 }}>Fichier (.csv, .xlsx, .xls)</AdminSectionLabel>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={sourceBusy}
                  className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface-sub px-3 py-2 text-sm text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-engage file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-engage-hover"
                />
                <button
                  type="button"
                  onClick={handleImportFromGoogleSheet}
                  disabled={sourceBusy}
                  className="inline-block rounded-[11px] border border-line-field bg-white px-4 py-2.5 text-[13px] font-bold text-ink-2 hover:bg-surface-sub disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {loadingFromGoogleSheet ? 'Chargement du Google Sheet…' : 'Importer depuis Google Sheet public'}
                </button>
              </div>
              {loadingCatalog ? <p className="mt-2.5 text-xs text-ink-3">Chargement du référentiel compétences/matériel…</p> : null}
            </>
          )}
        </AdminCard>

        {rows.length > 0 ? (
          <div className="flex flex-col gap-4">
            <AdminCard padding="18px 22px">
              <div className="flex flex-wrap items-center gap-3.5">
                <input
                  type="search"
                  aria-label="Rechercher une mission"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Rechercher une mission (lieu, titre, type...)"
                  className="min-w-[220px] flex-1 rounded-[10px] border border-line-field bg-white px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring"
                />
                <div className="flex flex-wrap gap-2">
                  {(['nouveau', 'modifié', 'doublon', 'invalide'] as ImportFilter[]).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setActiveFilter(filter)}
                      className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-bold ${IMPORT_FILTER_TONE[filter]} ${activeFilter === filter ? 'ring-2 ring-accent-ring' : ''}`}
                    >
                      {IMPORT_STATUS_LABELS[filter]}
                      <span className="font-semibold opacity-65">{filterCounts[filter]}</span>
                    </button>
                  ))}
                </div>
              </div>
              {checkingDuplicates ? <p className="mt-2.5 text-xs text-ink-3">Vérification des doublons en base en cours…</p> : null}
              {duplicateCheckError ? <p className="mt-2.5 text-xs text-warn-text">{duplicateCheckError}</p> : null}
            </AdminCard>

            <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
              <div className="min-w-[960px]">
                <div className={`${TABLE_GRID_CLASS} border-b border-line-row bg-surface-sub px-5 py-3`}>
                  {['Statut', 'Mission', 'Date / heure', 'Lieu', 'Etat DO', 'Réversion', 'Besoins', 'Actions'].map((col) => (
                    <span key={col} className="text-[11px] font-bold uppercase tracking-wide text-ink-3">
                      {col}
                    </span>
                  ))}
                </div>

                <div className="min-w-[960px]">
                  {paginatedRows.map((row) => {
                    const rowStatus = rowStatuses.get(row.rowId) ?? 'invalide';
                    return (
                      <MissionImportRow
                        key={row.rowId}
                        row={row}
                        rowStatus={rowStatus}
                        importing={importing}
                        checkingDuplicates={checkingDuplicates}
                        skills={skills}
                        materiels={materiels}
                        onCommitEdit={handleCommitEdit}
                        onDelete={handleDeleteRow}
                        onImportSingle={importSingleMission}
                        onAddNeed={handleAddNeed}
                        onRemoveNeed={handleRemoveNeed}
                        onAddMateriel={handleAddMateriel}
                        onRemoveMateriel={handleRemoveMateriel}
                      />
                    );
                  })}

                  {visibleRows.length === 0 ? (
                    <div className="px-6 py-9 text-center text-[13.5px] text-ink-3">
                      Aucune mission avec le filtre &quot;{IMPORT_STATUS_LABELS[activeFilter]}&quot;
                      {searchQuery.trim() ? ` et la recherche "${searchQuery}"` : ''}.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{ ...ghostButtonStyle, ...(page === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : null) }}
                >
                  ← Précédent
                </button>
                <span className="text-[13px] text-ink-2">
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

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AdminSectionLabel>Statut d&apos;import</AdminSectionLabel>
                <div className="flex rounded-full bg-[#f1f5f9] p-[3px]">
                  <button
                    type="button"
                    onClick={() => setImportStatus('draft')}
                    disabled={importing}
                    className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold ${importStatus === 'draft' ? 'bg-white text-ink shadow-sm' : 'text-ink-3'}`}
                  >
                    Brouillon
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportStatus('proposed')}
                    disabled={importing}
                    className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold ${importStatus === 'proposed' ? 'bg-ok-soft text-ok-text shadow-sm' : 'text-ink-3'}`}
                  >
                    Proposé
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRows([]);
                    setFileName(null);
                    setSourceKind(null);
                    setLastSyncedAt(null);
                    setError(null);
                    setSuccess(null);
                    setSearchQuery('');
                    setActiveFilter('nouveau');
                    setPage(0);
                  }}
                  disabled={importing}
                  className="rounded-[9px] border border-line-field bg-white px-4 py-2 text-[13px] font-semibold text-ink-3 hover:bg-surface-sub disabled:cursor-not-allowed disabled:opacity-55"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleUpdateModified}
                  disabled={importing || dedupAnalysis.modifiedMissions.length === 0 || checkingDuplicates}
                  className="rounded-[9px] border border-[#fbe3bd] bg-[#fff8ee] px-4 py-2 text-[13px] font-semibold text-[#b4650c] hover:bg-[#fef3e2] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {importing ? 'Mise à jour…' : `Mettre à jour les modifiées (${dedupAnalysis.modifiedMissions.length})`}
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || dedupAnalysis.readyMissions.length === 0 || checkingDuplicates}
                  className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#dbe2f5] bg-[#eef1fb] px-4 py-2 text-[13.5px] font-semibold text-[#2d3f7a] hover:bg-[#e3e8f8] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <Icon name="upload" size={16} />
                  {importing ? 'Import en cours…' : `Importer les nouvelles (${dedupAnalysis.readyMissions.length})`}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
