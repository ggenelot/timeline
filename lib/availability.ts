import { AvailabilityLevel } from '@/lib/types';

export const AVAILABILITY_LEVEL_LABELS: Record<AvailabilityLevel, string> = {
  0: 'Indispo',
  1: 'Si galère',
  2: 'Why not',
  3: 'Chaud !'
};

// Couleurs des niveaux — mêmes tokens que les badges ok/warn/bad + engage
// (README §Boutons). Le niveau 3 sélectionné utilise un fond plein.
export const AVAILABILITY_LEVEL_STYLES: Record<
  AvailabilityLevel,
  { bg: string; text: string; border: string; solid: string }
> = {
  0: { bg: 'bg-bad-soft', text: 'text-bad', border: 'border-bad', solid: '#D14343' },
  1: { bg: 'bg-warn-soft', text: 'text-warn-text', border: 'border-[#F59E0B]', solid: '#F59E0B' },
  2: { bg: 'bg-ok-soft', text: 'text-ok-text', border: 'border-[#22B26B]', solid: '#22B26B' },
  3: { bg: 'bg-engage', text: 'text-white', border: 'border-engage', solid: '#059669' }
};

export type MonthGridDay = {
  date: Date;
  iso: string;
  dayOfMonth: number;
  isWeekend: boolean;
  isPast: boolean;
};

export type MonthGrid = {
  key: string;
  label: string;
  cells: Array<MonthGridDay | null>;
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function isoDate(date: Date): string {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

/** Grilles mensuelles (mois courant + `monthCount - 1` suivants), lundi en tête de semaine. */
export function buildMonthGrids(monthCount: number, referenceDate: Date = new Date()): MonthGrid[] {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

  const grids: MonthGrid[] = [];
  for (let i = 0; i < monthCount; i++) {
    const first = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const label = capitalize(first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
    const lead = (first.getDay() + 6) % 7;
    const nDays = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();

    const cells: Array<MonthGridDay | null> = [];
    for (let b = 0; b < lead; b++) cells.push(null);
    for (let d = 1; d <= nDays; d++) {
      const date = new Date(first.getFullYear(), first.getMonth(), d);
      const dow = date.getDay();
      cells.push({
        date,
        iso: isoDate(date),
        dayOfMonth: d,
        isWeekend: dow === 0 || dow === 6,
        isPast: date < today
      });
    }

    grids.push({ key: `${first.getFullYear()}-${first.getMonth() + 1}`, label, cells });
  }
  return grids;
}

/** Première et dernière (exclue) journée couvertes par `monthCount` mois à partir d'aujourd'hui. */
export function monthRangeISO(monthCount: number, referenceDate: Date = new Date()): { fromISO: string; toISO: string } {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + monthCount, 1);
  return { fromISO: isoDate(from), toISO: isoDate(to) };
}

export const DOW_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
