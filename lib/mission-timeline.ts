import { MissionProposal } from '@/lib/types';

export type MissionRelation = 'pending' | 'engaged' | 'retenu' | 'declined';

// Explicit type → color mapping from the design handoff (matched on mission_types.name).
const TYPE_COLOR_BY_NAME: Record<string, string> = {
  'Poste de secours': '#2563eb',
  Maraude: '#7c3aed',
  Formation: '#d97706',
  Garde: '#0d9488',
  "Vie de l'antenne": '#64748b'
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

export function relationForProposal(proposal: MissionProposal | undefined, isRetained: boolean): MissionRelation {
  if (isRetained) return 'retenu';
  if (!proposal) return 'pending';
  if (proposal.response === 'available') return 'engaged';
  if (proposal.response === 'unavailable') return 'declined';
  return 'pending';
}
