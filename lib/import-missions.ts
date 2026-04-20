import { MissionCategory } from '@/lib/types';

export type ImportFieldKey =
  | 'do_status'
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
  source: 'block' | 'tabular';
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
  requirements_notes: string | null;
  equipment_notes: string | null;
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

function parseCsvLine(line: string): string[] {
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

    if (char === ';' && !insideQuotes) {
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
  return content
    .split(/\r?\n/)
    .map((line) => parseCsvLine(line).map((cell) => normalizeCell(cell)));
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

    const values: Record<ImportFieldKey, string | null> = {
      do_status: null,
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

    const rawPairs: Array<{ label: string; value: string }> = [];

    row.forEach((cell, index) => {
      const key = mappedHeaders[index];
      const value = normalizeCell(cell);
      if (!key || !value) {
        return;
      }

      values[key] = value;
      rawPairs.push({ label: headerRow[index] ?? key, value });
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

    if (!key) {
      return;
    }

    const isPotentialNewBlock = key === 'title' || key === 'do_status';

    if (!current) {
      current = {
        blockIndex: blocks.length,
        source: 'block',
        values: {
          do_status: null,
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
        },
        rawPairs: []
      };
    } else if (isPotentialNewBlock && current.values[key] !== null) {
      pushCurrent();
      current = {
        blockIndex: blocks.length,
        source: 'block',
        values: {
          do_status: null,
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
        },
        rawPairs: []
      };
    }

    current.values[key] = value || null;
    current.rawPairs.push({ label, value });
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

  const blocks = isTabularFormat(normalizedRows)
    ? extractBlocksFromTabularRows(normalizedRows)
    : extractBlocksFromLabelValueRows(normalizedRows);

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
      const startsAtDate = new Date(Date.UTC(parsedMissionDate.year, parsedMissionDate.month - 1, parsedMissionDate.day, parsedRange.startHour, parsedRange.startMinute, 0));
      const endsAtDate = new Date(Date.UTC(parsedMissionDate.year, parsedMissionDate.month - 1, parsedMissionDate.day, parsedRange.endHour, parsedRange.endMinute, 0));

      if (endsAtDate <= startsAtDate) {
        endsAtDate.setUTCDate(endsAtDate.getUTCDate() + 1);
      }

      normalized = {
        sourceBlockIndex: block.blockIndex,
        title,
        location: block.values.location?.trim() || null,
        starts_at: startsAtDate.toISOString(),
        ends_at: endsAtDate.toISOString(),
        required_volunteers: inferRequiredVolunteers(block.values.requirements_notes),
        category: inferCategory(block.values.type),
        do_status: block.values.do_status?.trim() || null,
        requirements_notes: block.values.requirements_notes?.trim() || null,
        equipment_notes: block.values.equipment_notes?.trim() || null,
        reversion_expected: expected,
        reversion_actual: actual,
        validation_date: validation ? `${validation.year.toString().padStart(4, '0')}-${validation.month.toString().padStart(2, '0')}-${validation.day.toString().padStart(2, '0')}` : null,
        raw_import_payload: {
          ...block.values
        }
      };
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
