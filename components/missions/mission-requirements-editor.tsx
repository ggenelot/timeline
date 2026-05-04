import { MissionRequirementFormState } from '@/components/missions/mission-form';
import { getSkillBadgeClass } from '@/components/skills/skill-badge';

type SkillOption = {
  id: string;
  name: string;
  category?: 'formation' | 'operationnel' | 'conduite' | 'accso' | 'technique' | null;
};

type MissionRequirementsEditorProps = {
  requirements: MissionRequirementFormState[];
  onRequirementsChange: (nextValue: MissionRequirementFormState[]) => void;
  availableSkills: SkillOption[];
  requirementsError?: string | null;
  submitting: boolean;
};

const GENERIC_VOLUNTEER_LABEL = 'Sans compétence particulière (bénévole)';

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

  const neutralSkillBadgeClass = 'inline-flex rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-sm text-slate-700';

  return (
    <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Besoins en bénévoles</h2>
          <p className="text-xs text-slate-600">Optionnel. Définissez plusieurs besoins avec ou sans compétence spécifique.</p>
        </div>
        <button
          type="button"
          onClick={addRequirement}
          disabled={submitting || requirements.length >= availableSkills.length + 1}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ajouter un besoin
        </button>
      </div>

      {requirements.length > 0 ? (
        <div className="space-y-2">
          {requirements.map((requirement, index) => {
            const usedSkillIdsByOtherRows = new Set(selectedSkillIds.filter((skillId, selectedIndex) => selectedIndex !== index));

            return (
              <div key={`${index}-${requirement.skill_id || 'generic'}`} className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateRequirement(index, { skill_id: '' })}
                    disabled={submitting || usedSkillIdsByOtherRows.has('')}
                    className={`${requirement.skill_id === '' ? getSkillBadgeClass('technique') : neutralSkillBadgeClass} disabled:cursor-not-allowed disabled:opacity-50`}
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
                        className={`${isSelected ? getSkillBadgeClass(skill.category ?? null) : neutralSkillBadgeClass} disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {skill.name}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center overflow-hidden rounded-full border border-slate-300">
                    <button type="button" onClick={() => updateQuantity(index, Number.parseInt(requirement.quantity || '1', 10) - 1)} disabled={submitting} className="px-2 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">-</button>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={requirement.quantity}
                      onChange={(event) => updateRequirement(index, { quantity: event.target.value })}
                      className="w-12 border-x border-slate-300 px-1 py-1 text-center text-sm"
                      disabled={submitting}
                      required
                    />
                    <button type="button" onClick={() => updateQuantity(index, Number.parseInt(requirement.quantity || '1', 10) + 1)} disabled={submitting} className="px-2 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">+</button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeRequirement(index)}
                    disabled={submitting}
                    className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-600">Aucun besoin spécifique défini.</p>
      )}

      {requirementsError ? <p className="text-xs text-red-700">{requirementsError}</p> : null}
    </section>
  );
}
