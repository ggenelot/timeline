import { MissionProposal, MissionStatus } from '@/lib/types';

export type MissionRelation = 'pending' | 'engaged' | 'retenu' | 'declined';

// Explicit type → color mapping from the design handoff (matched on mission_types.name).
// Catégories de la refonte : opé (orange) / for (navy) / ac.sso (magenta).
const TYPE_COLOR_BY_NAME: Record<string, string> = {
  'Poste de secours': '#FF7F30', // opé
  Garde: '#FF7F30', // opé
  Formation: '#00378F', // for
  Maraude: '#AB0093', // ac.sso
  "Vie de l'antenne": '#5B6478' // neutre
};

// Fallback for configurable types that store a named color (same convention as skill categories).
const NAMED_COLOR_HEX: Record<string, string> = {
  slate: '#64748b',
  red: '#dc2626',
  rose: '#e11d48',
  orange: '#d97706',
  amber: '#d97706',
  blue: '#2563eb',
  sky: '#0284c7',
  cyan: '#0891b2',
  teal: '#0d9488',
  emerald: '#059669',
  green: '#16a34a',
  violet: '#7c3aed',
  indigo: '#4f46e5',
  pink: '#db2777'
};

export const MISSION_TYPE_FALLBACK_COLOR = '#64748b';

export function resolveMissionTypeColor(name?: string | null, dbColor?: string | null): string {
  if (name && TYPE_COLOR_BY_NAME[name]) return TYPE_COLOR_BY_NAME[name];
  if (dbColor && NAMED_COLOR_HEX[dbColor]) return NAMED_COLOR_HEX[dbColor];
  if (dbColor && /^#[0-9a-fA-F]{6}$/.test(dbColor)) return dbColor;
  return MISSION_TYPE_FALLBACK_COLOR;
}

// minutes totales = ends - starts ; "6h", "3h30"
export function formatMissionDuration(startISO: string, endISO: string): string {
  const minutes = Math.max(0, Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h${String(remainder).padStart(2, '0')}`;
}

export function missionMonthKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function missionMonthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

// Couleur du nœud de frise pour la vue admin, par statut de mission.
export const MISSION_STATUS_NODE_COLOR: Record<MissionStatus, string> = {
  draft: '#F59E0B', // warn
  proposed: '#1E3C87', // navy
  confirmed: '#22B26B', // ok
  closed: '#8A93A6', // ink-3
  cancelled: '#D14343' // bad
};

export function groupMissionsByMonth<T extends { starts_at: string }>(
  items: T[]
): Array<{ key: string; label: string; missions: T[] }> {
  const groups: Array<{ key: string; label: string; missions: T[] }> = [];
  const indexByKey = new Map<string, number>();
  items.forEach((item) => {
    const key = missionMonthKey(item.starts_at);
    let index = indexByKey.get(key);
    if (index === undefined) {
      index = groups.length;
      indexByKey.set(key, index);
      groups.push({ key, label: missionMonthLabel(item.starts_at), missions: [] });
    }
    groups[index].missions.push(item);
  });
  return groups;
}

// ── Regroupement par jour (board OPE) ─────────────────────────────
// Clé locale "AAAA-MM-JJ" : on utilise les composantes locales pour que la
// colonne corresponde au jour tel que vu par l'utilisateur (pas l'UTC).
export function missionDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function missionDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Axe des jours de la fenêtre [from, from+days[ — inclut les jours vides
// (nécessaire pour afficher les colonnes sans événement du board).
export function buildDayAxis(fromISO: string, days: number): Array<{ key: string; label: string; dateISO: string }> {
  const start = new Date(fromISO);
  start.setHours(0, 0, 0, 0);
  const axis: Array<{ key: string; label: string; dateISO: string }> = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString();
    axis.push({ key: missionDayKey(iso), label: missionDayLabel(iso), dateISO: iso });
  }
  return axis;
}

export function relationForProposal(proposal: MissionProposal | undefined, isRetained: boolean): MissionRelation {
  if (isRetained) return 'retenu';
  if (!proposal) return 'pending';
  if (proposal.response === 'available') return 'engaged';
  if (proposal.response === 'unavailable') return 'declined';
  return 'pending';
}
