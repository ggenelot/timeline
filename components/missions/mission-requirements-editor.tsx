import { MissionRequirementFormState } from '@/components/missions/mission-form';

type SkillOption = {
  id: string;
  name: string;
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
              <div key={`${index}-${requirement.skill_id || 'generic'}`} className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_120px_auto]">
                <label className="text-xs text-slate-700">
                  Compétence
                  <select
                    value={requirement.skill_id}
                    onChange={(event) => updateRequirement(index, { skill_id: event.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    disabled={submitting}
                  >
                    <option value="" disabled={usedSkillIdsByOtherRows.has('')}>
                      {GENERIC_VOLUNTEER_LABEL}
                    </option>
                    {availableSkills.map((skill) => {
                      const isUsedInAnotherRow = usedSkillIdsByOtherRows.has(skill.id);

                      return (
                        <option key={skill.id} value={skill.id} disabled={isUsedInAnotherRow}>
                          {skill.name}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <label className="text-xs text-slate-700">
                  Quantité
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={requirement.quantity}
                    onChange={(event) => updateRequirement(index, { quantity: event.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    disabled={submitting}
                    required
                  />
                </label>

                <div className="flex items-end">
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
