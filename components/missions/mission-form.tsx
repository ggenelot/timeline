import { FormEvent, ReactNode } from 'react';
import { MissionStatus } from '@/lib/types';
import {
  AdminButton,
  AdminFieldLabel,
  adminInputStyle,
  adminTextareaStyle,
  pillStyle,
} from '@/components/admin/ui';

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

const fieldLabelText = { fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 7 } as const;

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
    <form style={{ display: 'flex', flexDirection: 'column', gap: 18 }} onSubmit={onSubmit}>
      <div>
        <AdminFieldLabel htmlFor="mission-title">Titre *</AdminFieldLabel>
        <input
          id="mission-title"
          type="text"
          value={form.title}
          onChange={(event) => onChange({ ...form, title: event.target.value })}
          style={adminInputStyle}
          placeholder="Ex: Distribution alimentaire secteur Nord"
          disabled={submitting}
          required
        />
      </div>

      <div>
        <AdminFieldLabel htmlFor="mission-description">Description</AdminFieldLabel>
        <textarea
          id="mission-description"
          value={form.description}
          onChange={(event) => onChange({ ...form, description: event.target.value })}
          style={{ ...adminTextareaStyle, minHeight: 112 }}
          placeholder="Détails opérationnels de la mission"
          disabled={submitting}
        />
      </div>

      <div>
        <AdminFieldLabel htmlFor="mission-location">Lieu</AdminFieldLabel>
        <input
          id="mission-location"
          type="text"
          value={form.location}
          onChange={(event) => onChange({ ...form, location: event.target.value })}
          style={adminInputStyle}
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
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div>
          <AdminFieldLabel>Début *</AdminFieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input
              type="date"
              aria-label="Date de début"
              value={form.starts_at_date}
              onChange={(event) => onChange({ ...form, starts_at_date: event.target.value, ends_at_date: form.ends_at_date || event.target.value })}
              style={adminInputStyle}
              disabled={submitting}
              required
            />
            <input
              type="time"
              aria-label="Heure de début"
              value={form.starts_at_time}
              onChange={(event) => onChange({ ...form, starts_at_time: event.target.value })}
              style={adminInputStyle}
              disabled={submitting}
              required
            />
          </div>
        </div>

        <div>
          <AdminFieldLabel>Fin *</AdminFieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input
              type="date"
              aria-label="Date de fin"
              value={form.ends_at_date}
              onChange={(event) => onChange({ ...form, ends_at_date: event.target.value })}
              style={adminInputStyle}
              disabled={submitting}
              required
            />
            <input
              type="time"
              aria-label="Heure de fin"
              value={form.ends_at_time}
              onChange={(event) => onChange({ ...form, ends_at_time: event.target.value })}
              style={adminInputStyle}
              disabled={submitting}
              required
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <div>
          <AdminFieldLabel>Catégorie *</AdminFieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {missionTypes.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange({ ...form, mission_type_id: option.id })}
                disabled={submitting}
                aria-pressed={form.mission_type_id === option.id}
                style={{ ...pillStyle(form.mission_type_id === option.id), ...(submitting ? { opacity: 0.6, cursor: 'not-allowed' } : null) }}
              >
                {option.name}
              </button>
            ))}
            {missionTypes.length === 0 && (
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Chargement des types de mission...</p>
            )}
          </div>
        </div>

        <div>
          <AdminFieldLabel>Statut *</AdminFieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MISSION_STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange({ ...form, status: option.value })}
                disabled={submitting}
                aria-pressed={form.status === option.value}
                style={{ ...pillStyle(form.status === option.value), ...(submitting ? { opacity: 0.6, cursor: 'not-allowed' } : null) }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13, border: '1px solid #eef1f5', background: '#fcfcfd', borderRadius: 12, padding: 14 }}>
          <label style={{ display: 'flex', cursor: 'pointer', alignItems: 'center', gap: 9, fontSize: 13.5, fontWeight: 700, color: '#334155' }}>
            <input
              type="checkbox"
              checked={recurrence.enabled}
              onChange={(e) => onRecurrenceChange({ ...recurrence, enabled: e.target.checked })}
              disabled={submitting}
            />
            Répéter cette mission
          </label>

          {recurrence.enabled ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13, paddingLeft: 24 }}>
              <div>
                <div style={fieldLabelText}>Fréquence</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onRecurrenceChange({ ...recurrence, frequency: option.value })}
                      disabled={submitting}
                      aria-pressed={recurrence.frequency === option.value}
                      style={{ ...pillStyle(recurrence.frequency === option.value), ...(submitting ? { opacity: 0.6, cursor: 'not-allowed' } : null) }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {recurrence.frequency === 'weekly' ? (
                <div>
                  <div style={fieldLabelText}>Jours de la semaine</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
                        style={{ ...pillStyle(recurrence.days_of_week.includes(index)), ...(submitting ? { opacity: 0.6, cursor: 'not-allowed' } : null) }}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <label htmlFor="mission-recurrence-end" style={fieldLabelText}>Répéter jusqu&apos;au *</label>
                <input
                  id="mission-recurrence-end"
                  type="date"
                  value={recurrence.end_date}
                  onChange={(e) => onRecurrenceChange({ ...recurrence, end_date: e.target.value })}
                  disabled={submitting}
                  style={adminInputStyle}
                  required={recurrence.enabled}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {createdByLabel ? (
        <div>
          <AdminFieldLabel htmlFor="mission-created-by">Créé par</AdminFieldLabel>
          <input
            id="mission-created-by"
            type="text"
            value={createdByLabel}
            style={{ ...adminInputStyle, background: '#f1f5f9', color: '#64748b' }}
            disabled
            readOnly
          />
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        <AdminButton type="submit" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </AdminButton>
        {footerActions}
      </div>
    </form>
  );
}
