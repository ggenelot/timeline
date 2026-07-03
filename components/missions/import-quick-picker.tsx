import { getSkillColorClass } from '@/components/skills/skill-badge';
import { AdminSectionLabel } from '@/components/admin/ui';

export type QuickPickOption = { id: string; label: string };

type ImportQuickPickerProps = {
  title: string;
  helperText?: string;
  options: QuickPickOption[];
  selected: Record<string, number>;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  tone: 'violet' | 'sky';
  disabled?: boolean;
  emptyLabel: string;
};

const neutralPillClass =
  'inline-flex cursor-pointer items-center rounded-full border border-line-field bg-surface-sub px-2.5 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50';

// Éditeur "à pastilles" utilisé dans la ligne dépliée de l'import de missions : cliquer sur une
// option ajoute/incrémente un badge en dessous, un × sur le badge le retire. Volontairement plus
// simple que MissionRequirementsEditor/MissionMaterielEditor (pas de stepper +/- séparé), pour un
// usage ponctuel rapide au moment de l'import.
export function ImportQuickPicker({
  title,
  helperText,
  options,
  selected,
  onAdd,
  onRemove,
  tone,
  disabled,
  emptyLabel
}: ImportQuickPickerProps) {
  const badgeClass = getSkillColorClass(tone);
  const selectedEntries = Object.entries(selected).filter(([, quantity]) => quantity > 0);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line-row bg-surface-sub p-3.5">
      <div>
        <AdminSectionLabel>{title}</AdminSectionLabel>
        {helperText ? <p className="mt-1 text-xs text-ink-3">{helperText}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {options.map((option) => (
          <button key={option.id} type="button" onClick={() => onAdd(option.id)} disabled={disabled} className={neutralPillClass}>
            {option.label}
          </button>
        ))}
        {options.length === 0 ? <p className="m-0 text-xs text-ink-3">Aucune option disponible.</p> : null}
      </div>

      {selectedEntries.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedEntries.map(([id, quantity]) => {
            const label = options.find((option) => option.id === id)?.label ?? emptyLabel;
            return (
              <span key={id || 'generic'} className={`inline-flex items-center gap-1.5 rounded-full border py-1.5 pl-3 pr-1.5 text-sm font-bold ${badgeClass}`}>
                {label} · {quantity}
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  disabled={disabled}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-current leading-none hover:opacity-70 disabled:cursor-not-allowed"
                  aria-label={`Retirer ${label}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="m-0 text-xs text-ink-3">Aucun besoin défini pour l&apos;instant.</p>
      )}
    </div>
  );
}
