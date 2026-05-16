import { FormEvent, ReactNode } from 'react';
import { MissionStatus } from '@/lib/types';

export type MissionTypeOption = { id: string; name: string };
import { MissionRequirementsEditor } from '@/components/missions/mission-requirements-editor';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';

export type RecurrenceFormState = {
  enabled: boolean;
  frequency: RecurrenceFrequency;
  days_of_week: number[];
  end_date: string;
};

export const INITIAL_RECURRENCE_FORM: RecurrenceFormState = {
  enabled: false,
  frequency: 'weekly',
  days_of_week: [],
  end_date: ''
};

export type MissionFormState = {
  title: string;
  description: string;
  location: string;
  starts_at_date: string;
  starts_at_time: string;
  ends_at_date: string;
  ends_at_time: string;
  required_volunteers: string;
  mission_type_id: string;
  status: MissionStatus;
};

export const INITIAL_MISSION_FORM: MissionFormState = {
  title: '',
  description: '',
  location: '',
  
  starts_at_date: '',
  starts_at_time: '',
  ends_at_date: '',
  ends_at_time: '',
  required_volunteers: '1',
  mission_type_id: 'aaaaaaaa-0000-0000-0000-000000000001',
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
  missionTypes?: MissionTypeOption[];
  requirements?: MissionRequirementFormState[];
  onRequirementsChange?: (nextValue: MissionRequirementFormState[]) => void;
  availableSkills?: SkillOption[];
  requirementsError?: string | null;
  locationSuggestions?: string[];
  recurrence?: RecurrenceFormState;
  onRecurrenceChange?: (nextValue: RecurrenceFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  createdByLabel?: string;
  footerActions?: ReactNode;
};

const DAYS_OF_WEEK = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const FREQUENCY_OPTIONS: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: 'daily', label: 'Quotidienne' },
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'monthly', label: 'Mensuelle' }
];

export function MissionForm({
  form,
  onChange,
  missionTypes = [],
  requirements = [],
  onRequirementsChange,
  availableSkills = [],
  requirementsError,
  locationSuggestions = [],
  recurrence,
  onRecurrenceChange,
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

      <div className="grid gap-4">
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

      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm text-slate-700">Début *</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={form.starts_at_date}
              onChange={(event) => onChange({ ...form, starts_at_date: event.target.value, ends_at_date: form.ends_at_date || event.target.value })}
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

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm text-slate-700">Catégorie *</p>
          <div className="flex flex-wrap gap-2">
            {missionTypes.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange({ ...form, mission_type_id: option.id })}
                disabled={submitting}
                aria-pressed={form.mission_type_id === option.id}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  form.mission_type_id === option.id
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {option.name}
              </button>
            ))}
            {missionTypes.length === 0 && (
              <p className="text-sm text-slate-400">Chargement des types de mission...</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-slate-700">Statut *</p>
          <div className="flex flex-wrap gap-2">
            {MISSION_STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange({ ...form, status: option.value })}
                disabled={submitting}
                aria-pressed={form.status === option.value}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  form.status === option.value
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
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

      {recurrence !== undefined && onRecurrenceChange ? (
        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={recurrence.enabled}
              onChange={(e) => onRecurrenceChange({ ...recurrence, enabled: e.target.checked })}
              disabled={submitting}
              className="rounded"
            />
            Répéter cette mission
          </label>

          {recurrence.enabled ? (
            <div className="space-y-3 pl-6">
              <div className="space-y-1">
                <p className="text-sm text-slate-600">Fréquence</p>
                <div className="flex flex-wrap gap-2">
                  {FREQUENCY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onRecurrenceChange({ ...recurrence, frequency: option.value })}
                      disabled={submitting}
                      aria-pressed={recurrence.frequency === option.value}
                      className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                        recurrence.frequency === option.value
                          ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {recurrence.frequency === 'weekly' ? (
                <div className="space-y-1">
                  <p className="text-sm text-slate-600">Jours de la semaine</p>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((day, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          const days = recurrence.days_of_week.includes(index)
                            ? recurrence.days_of_week.filter((d) => d !== index)
                            : [...recurrence.days_of_week, index];
                          onRecurrenceChange({ ...recurrence, days_of_week: days });
                        }}
                        disabled={submitting}
                        aria-pressed={recurrence.days_of_week.includes(index)}
                        className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                          recurrence.days_of_week.includes(index)
                            ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="block text-sm text-slate-600">
                Répéter jusqu&apos;au *
                <input
                  type="date"
                  value={recurrence.end_date}
                  onChange={(e) => onRecurrenceChange({ ...recurrence, end_date: e.target.value })}
                  disabled={submitting}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  required={recurrence.enabled}
                />
              </label>
            </div>
          ) : null}
        </div>
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

      <div className="flex flex-wrap items-center justify-end gap-3">
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
