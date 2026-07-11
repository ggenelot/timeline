'use client';

import type { BoardSelection } from '@/lib/mission-board';
import { Icon } from '@/components/ui/icon';

// Pastille flottante rappelant l'élément sélectionné (glisser-déposer alternatif
// tactile) : « Affecter/Déplacer X — touchez un emplacement ».
export function SelectionBanner({ selection, onClear }: { selection: BoardSelection; onClear: () => void }) {
  const verb = selection.fromAssignmentId ? 'Déplacer' : 'Affecter';
  return (
    <div className="fixed inset-x-0 bottom-[calc(18px+env(safe-area-inset-bottom))] z-40 flex justify-center px-3">
      <div className="flex items-center gap-2.5 rounded-full bg-ink py-2.5 pl-4 pr-2.5 text-[13px] font-semibold text-white shadow-lift">
        <span>
          {verb} {selection.label} — touchez un emplacement
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Annuler la sélection"
          className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
        >
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  );
}
