import { MissionCategory } from '@/lib/types';

export type ImportFieldKey =
  | 'do_status'
  | 'retained_status'
  | 'title'
  | 'date'
  | 'time_range'
  | 'location'
  | 'requirements_notes'
  | 'equipment_notes'
  | 'reversion_expected'
  | 'reversion_actual'
  | 'type'
  | 'validation_date';

export type ImportIssue = {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  field?: ImportFieldKey;
};

export type RawMissionBlock = {
  blockIndex: number;
  source: 'block' | 'tabular' | 'columnar';
  values: Record<ImportFieldKey, string | null>;
  rawPairs: Array<{ label: string; value: string }>;
};

export type NormalizedMissionImport = {
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

export type MissionImportPreviewItem = {
  block: RawMissionBlock;
  normalized: NormalizedMissionImport | null;
  issues: ImportIssue[];
  isValid: boolean;
};

export type MissionImportPreview = {
  totalDetected: number;
  totalValid: number;
  totalErrors: number;
  items: MissionImportPreviewItem[];
};

const LABEL_SYNONYMS: Array<{ key: ImportFieldKey; aliases: string[] }> = [
  { key: 'do_status', aliases: ['etat do', 'état do', 'etatdo'] },
  { key: 'retained_status', aliases: ['retenue', 'retenu'] },
  { key: 'title', aliases: ['intitule', 'intitulé', 'titre'] },
  { key: 'date', aliases: ['date', 'jour'] },
  { key: 'time_range', aliases: ['horaires', 'horaire', 'heure'] },
  { key: 'location', aliases: ['lieu', 'adresse', 'localisation'] },
  { key: 'requirements_notes', aliases: ['nombre de secouristes', 'secouristes', 'effectif secouriste'] },
  { key: 'equipment_notes', aliases: ['materiel specifique', 'matériel spécifique', 'materiel', 'matériel'] },
  { key: 'reversion_expected', aliases: ['reversion', 'réversion'] },
  { key: 'reversion_actual', aliases: ['reversion reelle', 'réversion réelle', 'reversion réelle', 'réversion reelle'] },
  { key: 'type', aliases: ['type', 'categorie', 'catégorie'] },
  { key: 'validation_date', aliases: ['validation', 'date validation'] }
];

const MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  décembre: 12
};

function sanitize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeMissionTitleForDedup(value: string) {
  return sanitize(value).replace(/\s+/g, ' ').trim();
}

export function normalizeMissionDateForDedup(value: string) {
  const normalized = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

export function getMissionDateForDedupFromStartsAt(startsAtIso: string): string {
  return utcIsoToParisParts(startsAtIso)?.date ?? '';
}

export function buildMissionDedupKey(params: { title: string; missionDate: string }) {
  const normalizedTitle = normalizeMissionTitleForDedup(params.title);
  const normalizedDate = normalizeMissionDateForDedup(params.missionDate);

  if (!normalizedTitle || !normalizedDate) {
    return '';
  }

  return `${normalizedTitle}__${normalizedDate}`;
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).replace(/\u00a0/g, ' ').trim();
}

function mapLabelToKey(label: string): ImportFieldKey | null {
  const normalized = sanitize(label);

  for (const entry of LABEL_SYNONYMS) {
    if (entry.aliases.some((alias) => sanitize(alias) === normalized)) {
      return entry.key;
    }
  }

  return null;
}

function countDelimiter(line: string, delimiter: string) {
  let insideQuotes = false;
  let count = 0;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      count += 1;
    }
  }

  return count;
}

function detectCsvDelimiter(content: string): ';' | ',' | '\t' {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 10);
  const candidates: Array<';' | ',' | '\t'> = [';', ',', '\t'];

  let bestDelimiter: ';' | ',' | '\t' = ';';
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = lines.reduce((sum, line) => sum + countDelimiter(line, candidate), 0);
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = candidate;
    }
  }

  return bestDelimiter;
}

function parseDelimitedLine(line: string, delimiter: ';' | ',' | '\t'): string[] {
  const values: string[] = [];
  let buffer = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        buffer += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      values.push(buffer.trim());
      buffer = '';
      continue;
    }

    buffer += char;
  }

  values.push(buffer.trim());
  return values;
}

export function parseCsvContent(content: string): string[][] {
  const delimiter = detectCsvDelimiter(content);

  return content
    .split(/\r?\n/)
    .map((line) => parseDelimitedLine(line, delimiter).map((cell) => normalizeCell(cell)));
}

function isRowEmpty(row: string[]) {
  return row.every((cell) => normalizeCell(cell).length === 0);
}

function isTabularFormat(rows: string[][]): boolean {
  const firstNonEmptyRow = rows.find((row) => !isRowEmpty(row));

  if (!firstNonEmptyRow || firstNonEmptyRow.length < 3) {
    return false;
  }

  const knownHeaders = firstNonEmptyRow.filter((cell) => mapLabelToKey(cell)).length;
  return knownHeaders >= 2;
}

function createEmptyImportValues(): Record<ImportFieldKey, string | null> {
  return {
    do_status: null,
    retained_status: null,
    title: null,
    date: null,
    time_range: null,
    location: null,
    requirements_notes: null,
    equipment_notes: null,
    reversion_expected: null,
    reversion_actual: null,
    type: null,
    validation_date: null
  };
}

function isColumnarFormat(rows: string[][]): boolean {
  if (rows.length < 3) {
    return false;
  }

  const matchedLabels = rows.filter((row) => {
    const label = normalizeCell(row[0] ?? '');
    return mapLabelToKey(label) !== null;
  }).length;

  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return matchedLabels >= 4 && maxColumns >= 3;
}

function extractBlocksFromColumnarRows(rows: string[][]): RawMissionBlock[] {
  const labelRows = rows
    .map((row) => {
      const label = normalizeCell(row[0] ?? '');
      const key = mapLabelToKey(label);
      return { key, label, row };
    })
    .filter((item) => item.label.length > 0);

  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);

  const blocks: RawMissionBlock[] = [];

  for (let columnIndex = 1; columnIndex < maxColumns; columnIndex += 1) {
    const values = createEmptyImportValues();

    const rawPairs: Array<{ label: string; value: string }> = [];

    labelRows.forEach((labelRow) => {
      const value = normalizeCell(labelRow.row[columnIndex] ?? '');

      if (!value) {
        return;
      }

      rawPairs.push({ label: labelRow.label, value });
      if (labelRow.key) {
        values[labelRow.key] = value;
      }
    });

    if (Object.values(values).every((value) => value === null)) {
      continue;
    }

    blocks.push({
      blockIndex: blocks.length,
      source: 'columnar',
      values,
      rawPairs
    });
  }

  return blocks;
}

function extractBlocksFromTabularRows(rows: string[][]): RawMissionBlock[] {
  const firstNonEmptyIndex = rows.findIndex((row) => !isRowEmpty(row));

  if (firstNonEmptyIndex < 0) {
    return [];
  }

  const headerRow = rows[firstNonEmptyIndex].map((cell) => normalizeCell(cell));
  const mappedHeaders = headerRow.map((header) => mapLabelToKey(header));

  const blocks: RawMissionBlock[] = [];

  rows.slice(firstNonEmptyIndex + 1).forEach((row) => {
    if (isRowEmpty(row)) {
      return;
    }

    const values = createEmptyImportValues();

    const rawPairs: Array<{ label: string; value: string }> = [];

    row.forEach((cell, index) => {
      const key = mappedHeaders[index];
      const value = normalizeCell(cell);
      if (!value) {
        return;
      }

      rawPairs.push({ label: headerRow[index] ?? key, value });
      if (key) {
        values[key] = value;
      }
    });

    if (Object.values(values).every((value) => value === null)) {
      return;
    }

    blocks.push({
      blockIndex: blocks.length,
      source: 'tabular',
      values,
      rawPairs
    });
  });

  return blocks;
}

function extractBlocksFromLabelValueRows(rows: string[][]): RawMissionBlock[] {
  const blocks: RawMissionBlock[] = [];
  let current: RawMissionBlock | null = null;

  const pushCurrent = () => {
    if (current && Object.values(current.values).some((value) => value !== null)) {
      blocks.push(current);
    }
    current = null;
  };

  rows.forEach((row) => {
    const normalized = row.map((cell) => normalizeCell(cell));

    if (isRowEmpty(normalized)) {
      pushCurrent();
      return;
    }

    const label = normalized.find((cell) => cell.length > 0) ?? '';
    const labelIndex = normalized.findIndex((cell) => cell === label);
    const value = normalized.slice(labelIndex + 1).join(' ').trim();
    const key = mapLabelToKey(label);

    const isPotentialNewBlock = key === 'title' || key === 'do_status';

    if (!current && !key) {
      return;
    }

    if (!current) {
      current = {
        blockIndex: blocks.length,
        source: 'block',
        values: createEmptyImportValues(),
        rawPairs: []
      };
    } else if (key && isPotentialNewBlock && current.values[key] !== null) {
      pushCurrent();
      current = {
        blockIndex: blocks.length,
        source: 'block',
        values: createEmptyImportValues(),
        rawPairs: []
      };
    }

    current.rawPairs.push({ label, value });
    if (key) {
      current.values[key] = value || null;
    }
  });

  pushCurrent();
  return blocks;
}

function parseFrenchDecimal(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Convention d'import:
 * - Les dates/heures saisies dans les fichiers d'import sont interprétées en Europe/Paris.
 * - Les timestamps stockés en base restent des ISO UTC (timestamptz).
 */
const PARIS_TIME_ZONE = 'Europe/Paris';

function getParisDateParts(timestampMs: number) {
  const formatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(new Date(timestampMs));
  const read = (type: Intl.DateTimeFormatPartTypes) => Number.parseInt(parts.find((part) => part.type === type)?.value ?? '0', 10);

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute')
  };
}

export function parseParisLocalToUtcIso(
  value: { year: number; month: number; day: number; hour: number; minute: number } | null
): string | null {
  if (!value) {
    return null;
  }

  const guess = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, 0);

  for (let delta = -360; delta <= 360; delta += 1) {
    const candidate = guess - delta * 60_000;
    const parts = getParisDateParts(candidate);

    if (
      parts.year === value.year &&
      parts.month === value.month &&
      parts.day === value.day &&
      parts.hour === value.hour &&
      parts.minute === value.minute
    ) {
      return new Date(candidate).toISOString();
    }
  }

  return null;
}

export function utcIsoToParisParts(iso: string): { date: string; time: string } | null {
  const timestampMs = new Date(iso).getTime();
  if (Number.isNaN(timestampMs)) {
    return null;
  }

  const parts = getParisDateParts(timestampMs);
  return {
    date: `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`,
    time: `${parts.hour.toString().padStart(2, '0')}:${parts.minute.toString().padStart(2, '0')}`
  };
}

function parseDateValue(value: string | null, fallbackYear?: number): { year: number; month: number; day: number } | null {
  if (!value) {
    return null;
  }

  const normalized = sanitize(value).replace(/,/g, ' ');

  const shortMatch = normalized.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
  if (shortMatch) {
    const day = Number.parseInt(shortMatch[1], 10);
    const month = Number.parseInt(shortMatch[2], 10);
    const rawYear = shortMatch[3];
    const year = rawYear ? Number.parseInt(rawYear.length === 2 ? `20${rawYear}` : rawYear, 10) : fallbackYear;

    if (year && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  const longMatch = normalized.match(/(\d{1,2})\s+([a-zéûôîàèùç]+)\s+(\d{4})/i);
  if (longMatch) {
    const day = Number.parseInt(longMatch[1], 10);
    const month = MONTHS[longMatch[2]];
    const year = Number.parseInt(longMatch[3], 10);

    if (month && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  return null;
}

function parseTimeRange(value: string | null): { startHour: number; startMinute: number; endHour: number; endMinute: number } | null {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d{1,2})\s*[h:]\s*(\d{2})\s*[-–]\s*(\d{1,2})\s*[h:]\s*(\d{2})/i);

  if (!match) {
    return null;
  }

  const [startHour, startMinute, endHour, endMinute] = match.slice(1).map((part) => Number.parseInt(part, 10));

  const isValid = [startHour, endHour].every((hour) => hour >= 0 && hour <= 23) && [startMinute, endMinute].every((minute) => minute >= 0 && minute <= 59);
  if (!isValid) {
    return null;
  }

  return { startHour, startMinute, endHour, endMinute };
}

function inferCategory(value: string | null): MissionCategory {
  if (!value) {
    return 'maraude';
  }

  const normalized = sanitize(value);

  if (normalized.includes('garde')) {
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

function inferRequiredVolunteers(value: string | null): number {
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

export function buildMissionsPreview(rows: string[][]): MissionImportPreview {
  const normalizedRows = rows
    .map((row) => row.map((cell) => normalizeCell(cell)))
    .filter((row) => row.some((cell) => cell.length > 0));

  let blocks: RawMissionBlock[] = [];

  if (isColumnarFormat(normalizedRows)) {
    blocks = extractBlocksFromColumnarRows(normalizedRows);
  } else if (isTabularFormat(normalizedRows)) {
    blocks = extractBlocksFromTabularRows(normalizedRows);
  } else {
    blocks = extractBlocksFromLabelValueRows(normalizedRows);
  }

  const items = blocks.map((block) => {
    const issues: ImportIssue[] = [];
    const title = block.values.title?.trim() ?? '';

    if (!title) {
      issues.push({ code: 'missing_title', severity: 'error', field: 'title', message: 'Intitulé manquant.' });
    }

    const parsedMissionDate = parseDateValue(block.values.date);
    if (!parsedMissionDate) {
      issues.push({ code: 'invalid_date', severity: 'error', field: 'date', message: 'Date invalide ou manquante.' });
    }

    const parsedRange = parseTimeRange(block.values.time_range);
    if (!parsedRange) {
      issues.push({ code: 'invalid_time_range', severity: 'error', field: 'time_range', message: 'Horaires invalides ou manquants.' });
    }

    const validation = parseDateValue(block.values.validation_date, parsedMissionDate?.year);
    if (block.values.validation_date && !validation) {
      issues.push({
        code: 'invalid_validation_date',
        severity: 'warning',
        field: 'validation_date',
        message: 'La date de validation est invalide et sera ignorée.'
      });
    }

    const expected = parseFrenchDecimal(block.values.reversion_expected);
    if (block.values.reversion_expected && expected === null) {
      issues.push({
        code: 'invalid_reversion_expected',
        severity: 'warning',
        field: 'reversion_expected',
        message: 'Réversion attendue invalide et ignorée.'
      });
    }

    const actual = parseFrenchDecimal(block.values.reversion_actual);
    if (block.values.reversion_actual && actual === null) {
      issues.push({
        code: 'invalid_reversion_actual',
        severity: 'warning',
        field: 'reversion_actual',
        message: 'Réversion réelle invalide et ignorée.'
      });
    }

    let normalized: NormalizedMissionImport | null = null;

    if (parsedMissionDate && parsedRange && title) {
      const startsAtIso = parseParisLocalToUtcIso({
        year: parsedMissionDate.year,
        month: parsedMissionDate.month,
        day: parsedMissionDate.day,
        hour: parsedRange.startHour,
        minute: parsedRange.startMinute
      });

      const baseEndDate = { year: parsedMissionDate.year, month: parsedMissionDate.month, day: parsedMissionDate.day };
      const firstEndIso = parseParisLocalToUtcIso({
        ...baseEndDate,
        hour: parsedRange.endHour,
        minute: parsedRange.endMinute
      });

      let endsAtIso = firstEndIso;
      if (startsAtIso && firstEndIso && new Date(firstEndIso).getTime() <= new Date(startsAtIso).getTime()) {
        const dayAfter = new Date(Date.UTC(parsedMissionDate.year, parsedMissionDate.month - 1, parsedMissionDate.day, 12, 0, 0));
        dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
        const year = dayAfter.getUTCFullYear();
        const month = dayAfter.getUTCMonth() + 1;
        const day = dayAfter.getUTCDate();

        endsAtIso = parseParisLocalToUtcIso({
          year,
          month,
          day,
          hour: parsedRange.endHour,
          minute: parsedRange.endMinute
        });
      }

      if (!startsAtIso || !endsAtIso) {
        issues.push({
          code: 'timezone_conversion_error',
          severity: 'error',
          message: 'Impossible de convertir la date/heure importée en timezone Europe/Paris.'
        });
      } else {
        const rawPayload = block.rawPairs.reduce<Record<string, string | null>>((acc, pair) => {
          acc[pair.label] = pair.value || null;
          return acc;
        }, {});

        normalized = {
        sourceBlockIndex: block.blockIndex,
        title,
        location: block.values.location?.trim() || null,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        required_volunteers: inferRequiredVolunteers(block.values.requirements_notes),
        category: inferCategory(block.values.type),
        do_status: block.values.do_status?.trim() || null,
        retained_status: block.values.retained_status?.trim() || null,
        requirements_notes: block.values.requirements_notes?.trim() || null,
        equipment_notes: block.values.equipment_notes?.trim() || null,
        source_type_label: block.values.type?.trim() || null,
        reversion_expected: expected,
        reversion_actual: actual,
        validation_date: validation ? `${validation.year.toString().padStart(4, '0')}-${validation.month.toString().padStart(2, '0')}-${validation.day.toString().padStart(2, '0')}` : null,
        raw_import_payload: rawPayload
        };
      }
    }

    const blockingErrorCount = issues.filter((issue) => issue.severity === 'error').length;

    return {
      block,
      normalized,
      issues,
      isValid: Boolean(normalized) && blockingErrorCount === 0
    };
  });

  return {
    totalDetected: items.length,
    totalValid: items.filter((item) => item.isValid).length,
    totalErrors: items.reduce((count, item) => count + item.issues.filter((issue) => issue.severity === 'error').length, 0),
    items
  };
}
