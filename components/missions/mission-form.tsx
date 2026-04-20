import { FormEvent } from 'react';
import { MISSION_CATEGORY_OPTIONS, MissionCategory, MissionStatus } from '@/lib/types';

export type MissionFormState = {
  title: string;
  description: string;
  location: string;
  sector: string;
  starts_at_date: string;
  starts_at_time: string;
  ends_at_date: string;
  ends_at_time: string;
  required_volunteers: string;
  category: MissionCategory;
  status: MissionStatus;
};

export const INITIAL_MISSION_FORM: MissionFormState = {
  title: '',
  description: '',
  location: '',
  sector: '',
  starts_at_date: '',
  starts_at_time: '',
  ends_at_date: '',
  ends_at_time: '',
  required_volunteers: '1',
  category: 'maraude',
  status: 'draft'
};

export const MISSION_STATUS_OPTIONS: Array<{ value: MissionStatus; label: string }> = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'proposed', label: 'Proposée' },
  { value: 'closed', label: 'Clôturée' },
  { value: 'confirmed', label: 'Confirmée' },
  { value: 'cancelled', label: 'Annulée' }
];

export type MissionRequirementFormState = {
  skill_id: string;
  quantity: string;
};

type SkillOption = {
  id: string;
  name: string;
};

type MissionFormProps = {
  form: MissionFormState;
  onChange: (nextValue: MissionFormState) => void;
  requirements?: MissionRequirementFormState[];
  onRequirementsChange?: (nextValue: MissionRequirementFormState[]) => void;
  availableSkills?: SkillOption[];
  requirementsError?: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  createdByLabel?: string;
};

export function MissionForm({
  form,
  onChange,
  requirements = [],
  onRequirementsChange,
  availableSkills = [],
  requirementsError,
  onSubmit,
  submitting,
  submitLabel,
  submittingLabel,
  createdByLabel
}: MissionFormProps) {
  const selectedSkillIds = requirements.map((requirement) => requirement.skill_id).filter(Boolean);
  const canManageRequirements = Boolean(onRequirementsChange);

  function updateRequirement(index: number, patch: Partial<MissionRequirementFormState>) {
    if (!onRequirementsChange) {
      return;
    }

    onRequirementsChange(requirements.map((requirement, currentIndex) => (currentIndex === index ? { ...requirement, ...patch } : requirement)));
  }

  function removeRequirement(index: number) {
    if (!onRequirementsChange) {
      return;
    }

    onRequirementsChange(requirements.filter((_, currentIndex) => currentIndex !== index));
  }

  function addRequirement() {
    if (!onRequirementsChange) {
      return;
    }

    onRequirementsChange([...requirements, { skill_id: '', quantity: '1' }]);
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm text-slate-700">
        Titre *
        <input
          type="text"
          value={form.title}
          onChange={(event) => onChange({ ...form, title: event.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Ex: Distribution alimentaire secteur Nord"
          disabled={submitting}
          required
        />
      </label>

      <label className="block text-sm text-slate-700">
        Description
        <textarea
          value={form.description}
          onChange={(event) => onChange({ ...form, description: event.target.value })}
          className="mt-1 min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Détails opérationnels de la mission"
          disabled={submitting}
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-slate-700">
          Lieu
          <input
            type="text"
            value={form.location}
            onChange={(event) => onChange({ ...form, location: event.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Ex: Maison des associations"
            disabled={submitting}
          />
        </label>

        <label className="block text-sm text-slate-700">
          Secteur
          <input
            type="text"
            value={form.sector}
            onChange={(event) => onChange({ ...form, sector: event.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Ex: Nord"
            disabled={submitting}
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm text-slate-700">Début *</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={form.starts_at_date}
              onChange={(event) => onChange({ ...form, starts_at_date: event.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
              required
            />
            <input
              type="time"
              value={form.starts_at_time}
              onChange={(event) => onChange({ ...form, starts_at_time: event.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-slate-700">Fin *</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={form.ends_at_date}
              onChange={(event) => onChange({ ...form, ends_at_date: event.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
              required
            />
            <input
              type="time"
              value={form.ends_at_time}
              onChange={(event) => onChange({ ...form, ends_at_time: event.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={submitting}
              required
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block text-sm text-slate-700">
          Bénévoles requis *
          <input
            type="number"
            min={1}
            step={1}
            value={form.required_volunteers}
            onChange={(event) => onChange({ ...form, required_volunteers: event.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={submitting}
            required
          />
        </label>



        <label className="block text-sm text-slate-700">
          Catégorie *
          <select
            value={form.category}
            onChange={(event) => onChange({ ...form, category: event.target.value as MissionCategory })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={submitting}
            required
          >
            {MISSION_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-slate-700">
          Statut *
          <select
            value={form.status}
            onChange={(event) => onChange({ ...form, status: event.target.value as MissionStatus })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={submitting}
            required
          >
            {MISSION_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {canManageRequirements ? (
        <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Besoins en compétences</h2>
              <p className="text-xs text-slate-600">Optionnel. Vous pouvez définir les compétences et quantités nécessaires pour la mission.</p>
            </div>
            <button
              type="button"
              onClick={addRequirement}
              disabled={submitting || requirements.length >= availableSkills.length}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ajouter un besoin
            </button>
          </div>

          {requirements.length > 0 ? (
            <div className="space-y-2">
              {requirements.map((requirement, index) => {
                const usedSkillIdsByOtherRows = new Set(
                  selectedSkillIds.filter((skillId, selectedIndex) => selectedIndex !== index && skillId.length > 0)
                );

                return (
                  <div key={`${index}-${requirement.skill_id || 'empty'}`} className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_120px_auto]">
                    <label className="text-xs text-slate-700">
                      Compétence
                      <select
                        value={requirement.skill_id}
                        onChange={(event) => updateRequirement(index, { skill_id: event.target.value })}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        disabled={submitting}
                        required
                      >
                        <option value="">Sélectionner une compétence</option>
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
      ) : null}

      {createdByLabel ? (
        <label className="block text-sm text-slate-700">
          Créé par
          <input
            type="text"
            value={createdByLabel}
            className="mt-1 w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
            disabled
            readOnly
          />
        </label>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
