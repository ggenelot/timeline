// Types et parseurs défensifs pour les payloads eOPE.
//
// Les schémas JSON exacts de /api/events et /api/commitments ne sont PAS
// documentés par eOPE (voir docs/eope-api.md). Ce module fait donc du parsing
// tolérant : plusieurs noms de champs candidats sont acceptés, les champs
// inconnus sont ignorés, le JSON brut est conservé (missions.eope_payload) et
// tout élément inexploitable remonte une issue exploitable dans le journal de
// sync plutôt que de faire échouer le run. Après le premier test contre la
// préprod, resserrer les listes de candidats dans ce fichier.

import { parseParisLocalToUtcIso } from '@/lib/import-missions';

export type EopeParseIssue = {
  item_ref: string;
  message: string;
};

// Événement eOPE normalisé (équivalent d'une mission Timeline).
export type EopeEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string; // ISO UTC
  ends_at: string; // ISO UTC
  cancelled: boolean;
  // false = non publié côté eOPE (brouillon départemental) : pas de création.
  published: boolean;
  type_label: string | null;
  // Besoins en personnel : texte libre ("CP: 2, PSE2: 16…") et décompte par
  // rôle ({CP: 2, PSE2: 16, VPS: 1}) tels que fournis par eOPE.
  required_staff_text: string | null;
  required_equipment_text: string | null;
  required_staff: Record<string, number> | null;
  raw: Record<string, unknown>;
};

// Engagement validé eOPE normalisé (équivalent d'une affectation engagée).
export type EopeCommitment = {
  id: string;
  event_id: string | null;
  user_id: string | null;
  raw: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Déballe les enveloppes de liste habituelles ({data: []}, {items: []}, …).
export function unwrapEopeList(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload)) {
    for (const key of ['data', 'items', 'results', 'events', 'commitments', 'records']) {
      const value = payload[key];
      if (Array.isArray(value)) return value;
    }
  }
  return null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

// Certains champs relationnels peuvent être imbriqués ({user: {id: …}}).
function pickRef(record: Record<string, unknown>, flatKeys: string[], nestedKeys: string[]): string | null {
  const flat = pickString(record, flatKeys);
  if (flat) return flat;
  for (const key of nestedKeys) {
    const nested = record[key];
    if (isRecord(nested)) {
      const id = pickString(nested, ['id', 'uuid', 'sub']);
      if (id) return id;
    }
  }
  return null;
}

// Interprète une date eOPE en ISO UTC. Accepte les ISO horodatés (avec fuseau)
// tels quels ; un datetime naïf (sans fuseau) est interprété comme de l'heure
// locale Europe/Paris — hypothèse à confirmer lors du test préprod.
export function parseEopeDateToUtcIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();

  const naiveMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (naiveMatch) {
    return parseParisLocalToUtcIso({
      year: Number(naiveMatch[1]),
      month: Number(naiveMatch[2]),
      day: Number(naiveMatch[3]),
      hour: Number(naiveMatch[4]),
      minute: Number(naiveMatch[5])
    });
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseCancelled(record: Record<string, unknown>): boolean {
  for (const key of ['cancelled', 'is_cancelled', 'canceled', 'is_canceled']) {
    if (typeof record[key] === 'boolean') return record[key] as boolean;
  }
  const status = pickString(record, ['status', 'state']);
  if (!status) return false;
  const normalized = status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return normalized.includes('cancel') || normalized.includes('annul');
}

function parseTypeLabel(record: Record<string, unknown>): string | null {
  const flat = pickString(record, ['category', 'districtEventCategory', 'type', 'event_type', 'kind']);
  if (flat) return flat;
  for (const key of ['type', 'category']) {
    const nested = record[key];
    if (isRecord(nested)) {
      const label = pickString(nested, ['name', 'label', 'title']);
      if (label) return label;
    }
  }
  return null;
}

// requiredStaff arrive sous forme de chaîne JSON ('{"CP":2,"PSE2":16,"VPS":1}').
function parseRequiredStaff(record: Record<string, unknown>): Record<string, number> | null {
  const rawValue = record['requiredStaff'];
  let parsed: unknown = rawValue;
  if (typeof rawValue === 'string' && rawValue.trim()) {
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed)) return null;
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

// Allège le payload brut conservé dans missions.eope_payload : l'objet
// source embarque un logo en base64 de plusieurs kilo-octets.
function slimRawEvent(item: Record<string, unknown>): Record<string, unknown> {
  const source = item['source'];
  if (!isRecord(source)) return item;
  return {
    ...item,
    source: { id: source['id'] ?? null, displayName: source['displayName'] ?? null }
  };
}

export function parseEopeEvent(item: unknown, index: number): { event: EopeEvent | null; issue: EopeParseIssue | null } {
  if (!isRecord(item)) {
    return { event: null, issue: { item_ref: `events[${index}]`, message: "Élément inattendu (objet JSON attendu)." } };
  }

  const id = pickString(item, ['id', 'event_id', 'uuid']);
  if (!id) {
    return { event: null, issue: { item_ref: `events[${index}]`, message: "Identifiant d'événement introuvable (champs essayés : id, event_id, uuid)." } };
  }

  const title = pickString(item, ['title', 'name', 'label']);
  const starts_at = parseEopeDateToUtcIso(
    pickString(item, ['datetimeStart', 'starts_at', 'start_at', 'start_date', 'start', 'begin_at', 'from'])
  );
  const ends_at = parseEopeDateToUtcIso(
    pickString(item, ['datetimeEnd', 'ends_at', 'end_at', 'end_date', 'end', 'to'])
  );

  if (!title || !starts_at || !ends_at) {
    return {
      event: null,
      issue: {
        item_ref: `events[${index}] (id=${id})`,
        message: `Champs obligatoires manquants ou illisibles (titre: ${title ? 'ok' : 'manquant'}, début: ${starts_at ? 'ok' : 'manquant'}, fin: ${ends_at ? 'ok' : 'manquant'}). Clés reçues : ${Object.keys(item).join(', ')}.`
      }
    };
  }

  return {
    event: {
      id,
      title,
      description: pickString(item, ['description', 'details', 'notes']),
      location: pickString(item, ['location', 'place', 'address', 'venue']),
      starts_at,
      ends_at,
      cancelled: parseCancelled(item),
      published: item['published'] !== false,
      type_label: parseTypeLabel(item),
      required_staff_text: pickString(item, ['requiredStaffText']),
      required_equipment_text: pickString(item, ['requiredEquipement', 'requiredEquipment']),
      required_staff: parseRequiredStaff(item),
      raw: slimRawEvent(item)
    },
    issue: null
  };
}

export function parseEopeEvents(payload: unknown): { events: EopeEvent[]; issues: EopeParseIssue[] } {
  const list = unwrapEopeList(payload);
  if (!list) {
    return {
      events: [],
      issues: [{ item_ref: 'events', message: 'Réponse /api/events inattendue (liste JSON attendue, éventuellement sous data/items/results).' }]
    };
  }

  const events: EopeEvent[] = [];
  const issues: EopeParseIssue[] = [];
  list.forEach((item, index) => {
    const { event, issue } = parseEopeEvent(item, index);
    if (event) events.push(event);
    if (issue) issues.push(issue);
  });
  return { events, issues };
}

export function parseEopeCommitment(item: unknown, index: number): { commitment: EopeCommitment | null; issue: EopeParseIssue | null } {
  if (!isRecord(item)) {
    return { commitment: null, issue: { item_ref: `commitments[${index}]`, message: 'Élément inattendu (objet JSON attendu).' } };
  }

  const id = pickString(item, ['id', 'commitment_id', 'uuid']);
  if (!id) {
    return {
      commitment: null,
      issue: { item_ref: `commitments[${index}]`, message: "Identifiant d'engagement introuvable (champs essayés : id, commitment_id, uuid)." }
    };
  }

  return {
    commitment: {
      id,
      event_id: pickRef(item, ['event_id', 'eventId'], ['event']),
      user_id: pickRef(item, ['user_id', 'userId', 'sub'], ['user', 'volunteer', 'member']),
      raw: item
    },
    issue: null
  };
}

// Réponse d'un POST /api/commitments : soit l'engagement créé, soit une
// enveloppe {data|commitment: {...}}.
export function parseEopeCommitmentResponse(payload: unknown): EopeCommitment | null {
  if (isRecord(payload)) {
    for (const candidate of [payload, payload.data, payload.commitment]) {
      if (isRecord(candidate)) {
        const { commitment } = parseEopeCommitment(candidate, 0);
        if (commitment) return commitment;
      }
    }
  }
  return null;
}
