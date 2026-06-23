export const PERIOD_OPTIONS = [
  { value: '1m', label: '1 mois' },
  { value: '3m', label: '3 mois' },
  { value: '6m', label: '6 mois' },
  { value: '12m', label: '12 mois' },
  { value: 'ytd', label: 'Année en cours' },
] as const;

export type Period = '1m' | '3m' | '6m' | '12m' | 'ytd';

export const TYPE_COLORS: Record<string, string> = {
  Maraude: '#10b981',
  Garde: '#3b82f6',
  Formation: '#f59e0b',
  "Vie de l'antenne": '#8b5cf6',
  'Poste de secours': '#ef4444',
};

const VOLUNTEER_PALETTE = [
  '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
  '#06b6d4', '#a855f7', '#eab308', '#22c55e', '#f43f5e',
];

export function getVolunteerColor(profileId: string): string {
  let hash = 0;
  for (let i = 0; i < profileId.length; i++) {
    hash = ((hash << 5) - hash + profileId.charCodeAt(i)) | 0;
  }
  return VOLUNTEER_PALETTE[Math.abs(hash) % VOLUNTEER_PALETTE.length];
}

export function getTypeColor(typeName: string): string {
  return TYPE_COLORS[typeName] ?? '#94a3b8';
}
