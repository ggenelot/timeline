import type { MissionFormState } from '@/components/missions/mission-form';

export type EventTemplateId = 'maraude' | 'poste' | 'garde' | 'psc1';

export type EventTemplate = {
  id: EventTemplateId;
  label: string;
  defaults: Partial<MissionFormState>;
  requirementDefaults?: Array<{
    skillName?: string;
    quantity: string;
  }>;
};

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: 'maraude',
    label: 'Maraude',
    defaults: {
      title: 'Maraude',
      mission_type_id: 'aaaaaaaa-0000-0000-0000-000000000001',
      required_volunteers: '2'
    },
    requirementDefaults: [
      { skillName: 'CE2S', quantity: '1' },
      { skillName: 'conducteur VTP', quantity: '1' }
    ]
  },
  {
    id: 'poste',
    label: 'Poste',
    defaults: {
      title: 'Poste de secours',
      mission_type_id: 'aaaaaaaa-0000-0000-0000-000000000005'
    }
  },
  {
    id: 'garde',
    label: 'Garde',
    defaults: {
      title: 'Garde',
      mission_type_id: 'aaaaaaaa-0000-0000-0000-000000000002',
      required_volunteers: '5'
    },
    requirementDefaults: [
      { skillName: 'CEPS', quantity: '1' },
      { skillName: 'conducteur VPS', quantity: '1' },
      { quantity: '3' }
    ]
  },
  {
    id: 'psc1',
    label: 'PSC1',
    defaults: {
      title: 'Formation PSC1',
      mission_type_id: 'aaaaaaaa-0000-0000-0000-000000000003',
      starts_at_time: '08:30',
      ends_at_time: '17:30',
      required_volunteers: '3'
    },
    requirementDefaults: [
      { skillName: 'formateur PSC', quantity: '1' },
      { quantity: '2' }
    ]
  }
];

const EVENT_TEMPLATE_MAP = new Map<EventTemplateId, EventTemplate>(EVENT_TEMPLATES.map((template) => [template.id, template]));

export function getEventTemplateById(templateId: string | null): EventTemplate | null {
  if (!templateId) {
    return null;
  }

  return EVENT_TEMPLATE_MAP.get(templateId as EventTemplateId) ?? null;
}
