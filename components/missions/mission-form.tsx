import { FormEvent, ReactNode } from 'react';
import { MISSION_CATEGORY_OPTIONS, MissionCategory, MissionStatus } from '@/lib/types';
import { MissionRequirementsEditor } from '@/components/missions/mission-requirements-editor';

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
  locationSuggestions?: string[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  createdByLabel?: string;
  footerActions?: ReactNode;
};

export function MissionForm({
  form,
  onChange,
  requirements = [],
  onRequirementsChange,
  availableSkills = [],
  requirementsError,
  locationSuggestions = [],
  onSubmit,
  submitting,
  submitLabel,
  submittingLabel,
  createdByLabel,
  footerActions
}: MissionFormProps) {
  const canManageRequirements = Boolean(onRequirementsChange);

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
            list="mission-location-suggestions"
          />
          {locationSuggestions.length > 0 ? (
            <datalist id="mission-location-suggestions">
              {locationSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          ) : null}
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
        <MissionRequirementsEditor
          requirements={requirements}
          onRequirementsChange={onRequirementsChange!}
          availableSkills={availableSkills}
          requirementsError={requirementsError}
          submitting={submitting}
        />
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? submittingLabel : submitLabel}
        </button>

        {footerActions}
      </div>
    </form>
  );
}
