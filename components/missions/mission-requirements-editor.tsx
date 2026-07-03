import { MissionRequirementFormState } from '@/components/missions/mission-form';
import { getSkillColorClass } from '@/components/skills/skill-badge';
import { AdminSectionLabel } from '@/components/admin/ui';

type SkillOption = {
  id: string;
  name: string;
  color?: string | null;
};

type MissionRequirementsEditorProps = {
  requirements: MissionRequirementFormState[];
  onRequirementsChange: (nextValue: MissionRequirementFormState[]) => void;
  availableSkills: SkillOption[];
  requirementsError?: string | null;
  submitting: boolean;
};

export const GENERIC_VOLUNTEER_LABEL = 'Sans compétence particulière (bénévole)';

export function MissionRequirementsEditor({
  requirements,
  onRequirementsChange,
  availableSkills,
  requirementsError,
  submitting
}: MissionRequirementsEditorProps) {
  const selectedSkillIds = requirements.map((requirement) => requirement.skill_id);

  function updateRequirement(index: number, patch: Partial<MissionRequirementFormState>) {
    onRequirementsChange(requirements.map((requirement, currentIndex) => (currentIndex === index ? { ...requirement, ...patch } : requirement)));
  }

  function removeRequirement(index: number) {
    onRequirementsChange(requirements.filter((_, currentIndex) => currentIndex !== index));
  }

  function addRequirement() {
    onRequirementsChange([...requirements, { skill_id: '', quantity: '1' }]);
  }

  function updateQuantity(index: number, nextQuantity: number) {
    updateRequirement(index, { quantity: String(Math.max(1, nextQuantity)) });
  }

  const neutralSkillBadgeClass = 'inline-flex rounded-full border border-line-field bg-surface-sub px-2.5 py-1 text-sm text-ink-2';
  const stepBtn = { cursor: 'pointer', border: 'none', background: '#F7F9FC', color: '#5B6478', width: 32, height: 32, fontSize: 16, fontWeight: 700, fontFamily: 'inherit' } as const;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 13, border: '1px solid #EEF1F6', background: '#F7F9FC', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <AdminSectionLabel>Besoins en bénévoles</AdminSectionLabel>
          <p style={{ margin: '5px 0 0', fontSize: 12, color: '#8A93A6' }}>Optionnel. Définissez plusieurs besoins avec ou sans compétence spécifique.</p>
        </div>
        <button
          type="button"
          onClick={addRequirement}
          disabled={submitting || requirements.length >= availableSkills.length + 1}
          style={{ cursor: 'pointer', border: '1px solid #DCE2EC', background: '#fff', color: '#5B6478', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', opacity: submitting || requirements.length >= availableSkills.length + 1 ? 0.5 : 1 }}
        >
          Ajouter un besoin
        </button>
      </div>

      {requirements.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {requirements.map((requirement, index) => {
            const usedSkillIdsByOtherRows = new Set(selectedSkillIds.filter((skillId, selectedIndex) => selectedIndex !== index));

            return (
              <div key={`${index}-${requirement.skill_id || 'generic'}`} style={{ display: 'flex', flexDirection: 'column', gap: 11, border: '1px solid #EEF1F6', background: '#fff', borderRadius: 11, padding: 13 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => updateRequirement(index, { skill_id: '' })}
                    disabled={submitting || usedSkillIdsByOtherRows.has('')}
                    className={`${requirement.skill_id === '' ? getSkillColorClass('slate') : neutralSkillBadgeClass} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {GENERIC_VOLUNTEER_LABEL}
                  </button>
                  {availableSkills.map((skill) => {
                    const isUsedInAnotherRow = usedSkillIdsByOtherRows.has(skill.id);
                    const isSelected = requirement.skill_id === skill.id;

                    return (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => updateRequirement(index, { skill_id: skill.id })}
                        disabled={submitting || isUsedInAnotherRow}
                        className={`${isSelected ? getSkillColorClass(skill.color ?? null) : neutralSkillBadgeClass} disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {skill.name}
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
        <p style={{ margin: 0, fontSize: 12.5, color: '#8A93A6' }}>Aucun besoin spécifique défini.</p>
      )}

      {requirementsError ? <p style={{ margin: 0, fontSize: 12.5, color: '#D14343' }}>{requirementsError}</p> : null}
    </section>
  );
}
