import { MissionMaterielRequirementFormState, MaterielTypeOption } from '@/components/missions/mission-form';
import { getSkillColorClass } from '@/components/skills/skill-badge';
import { AdminSectionLabel } from '@/components/admin/ui';

type MissionMaterielEditorProps = {
  requirements: MissionMaterielRequirementFormState[];
  onRequirementsChange: (nextValue: MissionMaterielRequirementFormState[]) => void;
  availableMateriels: MaterielTypeOption[];
  requirementsError?: string | null;
  submitting: boolean;
};

export function MissionMaterielEditor({
  requirements,
  onRequirementsChange,
  availableMateriels,
  requirementsError,
  submitting
}: MissionMaterielEditorProps) {
  const selectedCategoryIds = requirements.map((requirement) => requirement.category_id);

  function updateRequirement(index: number, patch: Partial<MissionMaterielRequirementFormState>) {
    onRequirementsChange(requirements.map((requirement, currentIndex) => (currentIndex === index ? { ...requirement, ...patch } : requirement)));
  }

  function removeRequirement(index: number) {
    onRequirementsChange(requirements.filter((_, currentIndex) => currentIndex !== index));
  }

  function addRequirement() {
    onRequirementsChange([...requirements, { category_id: '', quantity: '1' }]);
  }

  function updateQuantity(index: number, nextQuantity: number) {
    updateRequirement(index, { quantity: String(Math.max(1, nextQuantity)) });
  }

  const neutralBadgeClass = 'inline-flex rounded-full border border-line-field bg-surface-sub px-2.5 py-1 text-sm text-ink-2';
  const stepBtn = { cursor: 'pointer', border: 'none', background: '#F7F9FC', color: '#5B6478', width: 32, height: 32, fontSize: 16, fontWeight: 700, fontFamily: 'inherit' } as const;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 13, border: '1px solid #EEF1F6', background: '#F7F9FC', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <AdminSectionLabel>Matériel requis</AdminSectionLabel>
          <p style={{ margin: '5px 0 0', fontSize: 12, color: '#8A93A6' }}>
            Optionnel. Définissez les catégories et quantités nécessaires. L&apos;affectation d&apos;un véhicule précis se fait ensuite sur la fiche mission.
          </p>
        </div>
        <button
          type="button"
          onClick={addRequirement}
          disabled={submitting || availableMateriels.length === 0 || requirements.length >= availableMateriels.length}
          style={{ cursor: 'pointer', border: '1px solid #DCE2EC', background: '#fff', color: '#5B6478', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', opacity: submitting || availableMateriels.length === 0 || requirements.length >= availableMateriels.length ? 0.5 : 1 }}
        >
          Ajouter du matériel
        </button>
      </div>

      {requirements.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {requirements.map((requirement, index) => {
            const usedCategoryIdsByOtherRows = new Set(selectedCategoryIds.filter((categoryId, selectedIndex) => selectedIndex !== index));

            return (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 11, border: '1px solid #EEF1F6', background: '#fff', borderRadius: 11, padding: 13 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  {availableMateriels.map((materiel) => {
                    const isUsedInAnotherRow = usedCategoryIdsByOtherRows.has(materiel.id);
                    const isSelected = requirement.category_id === materiel.id;

                    return (
                      <button
                        key={materiel.id}
                        type="button"
                        onClick={() => updateRequirement(index, { category_id: materiel.id })}
                        disabled={submitting || isUsedInAnotherRow}
                        className={`${isSelected ? getSkillColorClass(materiel.color ?? null) : neutralBadgeClass} disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {materiel.name}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', overflow: 'hidden', borderRadius: 9, border: '1px solid #DCE2EC' }}>
                    <button type="button" onClick={() => updateQuantity(index, Number.parseInt(requirement.quantity || '1', 10) - 1)} disabled={submitting} style={{ ...stepBtn, opacity: submitting ? 0.5 : 1 }}>−</button>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={requirement.quantity}
                      onChange={(event) => updateRequirement(index, { quantity: event.target.value })}
                      style={{ width: 48, borderTop: 'none', borderBottom: 'none', borderLeft: '1px solid #DCE2EC', borderRight: '1px solid #DCE2EC', padding: '7px 4px', textAlign: 'center', fontSize: 14, color: '#16203A', outline: 'none', fontFamily: 'inherit' }}
                      disabled={submitting}
                      required
                    />
                    <button type="button" onClick={() => updateQuantity(index, Number.parseInt(requirement.quantity || '1', 10) + 1)} disabled={submitting} style={{ ...stepBtn, opacity: submitting ? 0.5 : 1 }}>+</button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeRequirement(index)}
                    disabled={submitting}
                    style={{ cursor: 'pointer', border: '1px solid #F1C7C7', background: '#fff', color: '#D14343', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', opacity: submitting ? 0.5 : 1 }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, color: '#8A93A6' }}>Aucun matériel requis défini.</p>
      )}

      {requirementsError ? <p style={{ margin: 0, fontSize: 12.5, color: '#D14343' }}>{requirementsError}</p> : null}
    </section>
  );
}
