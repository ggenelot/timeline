// Palette partagée des couleurs de type de matériel (bandeaux de contenants,
// badges de compteur, pastilles) — mêmes teintes que la palette compétences.

export type MaterielColorTokens = { accent: string; soft: string; softBorder: string };

const MATERIEL_COLOR_PALETTE: Record<string, MaterielColorTokens> = {
  slate: { accent: '#5B6478', soft: '#F4F6FA', softBorder: '#E5E9F0' },
  amber: { accent: '#B4590F', soft: '#FFF3E9', softBorder: '#FBD9BE' },
  sky: { accent: '#1E3C87', soft: '#EEF4FE', softBorder: '#CFDDF6' },
  violet: { accent: '#7A2E86', soft: '#F5EDFA', softBorder: '#E3D6EF' },
  emerald: { accent: '#0B6E63', soft: '#E9F7F4', softBorder: '#C7E9E3' },
  pink: { accent: '#8E1279', soft: '#F8E6F4', softBorder: '#E9C9E4' },
  rose: { accent: '#D14343', soft: '#FDEAEA', softBorder: '#F5C6C6' },
  orange: { accent: '#B4590F', soft: '#FFF3E9', softBorder: '#FBD9BE' },
  cyan: { accent: '#0B6E63', soft: '#E9F7F4', softBorder: '#C7E9E3' },
  indigo: { accent: '#1E3C87', soft: '#EEF4FE', softBorder: '#CFDDF6' },
};

export function materielPalette(color: string | null | undefined): MaterielColorTokens {
  return MATERIEL_COLOR_PALETTE[color ?? ''] ?? MATERIEL_COLOR_PALETTE.slate;
}

export const MATERIEL_COLOR_OPTIONS = [
  { value: 'slate', label: 'Gris' },
  { value: 'amber', label: 'Ambre' },
  { value: 'sky', label: 'Ciel' },
  { value: 'violet', label: 'Violet' },
  { value: 'emerald', label: 'Vert' },
  { value: 'pink', label: 'Rose' },
  { value: 'rose', label: 'Rouge' },
  { value: 'orange', label: 'Orange' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'indigo', label: 'Indigo' },
];
