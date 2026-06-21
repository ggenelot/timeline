export type AppRole = 'admin' | 'responsable' | 'benevole';

export type Profile = {
  id: string;
  full_name: string | null;
  email: string;
  identifier?: string | null;
  role: AppRole;
  created_at: string;
  slack_user_id?: string | null;
  slack_team_id?: string | null;
  slack_username?: string | null;
  slack_connected_at?: string | null;
};

export type SkillCategory = {
  id: string;
  name: string;
  color: string;
  display_order: number;
  created_at: string;
};

export type Skill = {
  id: string;
  name: string;
  category_id: string | null;
  display_order: number;
  created_at: string;
  category?: SkillCategory | null;
};

export type ProfileSkill = {
  profile_id: string;
  skill_id: string;
  created_at: string;
  skill: Pick<Skill, 'id' | 'name' | 'category_id' | 'display_order'> | null;
};

export type MissionStatus = 'draft' | 'proposed' | 'closed' | 'confirmed' | 'cancelled';

export type MissionCategory = 'maraude' | 'garde' | 'formation' | 'vie_antenne' | 'poste_de_secours';

export const MISSION_CATEGORY_OPTIONS: Array<{ value: MissionCategory; label: string }> = [
  { value: 'maraude', label: 'Maraude' },
  { value: 'garde', label: 'Garde' },
  { value: 'formation', label: 'Formation' },
  { value: 'vie_antenne', label: "Vie de l'antenne" },
  { value: 'poste_de_secours', label: 'Poste de secours' }
];

export type HelpPage = {
  id: string;
  page_path: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export const MISSION_CATEGORY_LABELS: Record<MissionCategory, string> = {
  maraude: 'Maraude',
  garde: 'Garde',
  formation: 'Formation',
  vie_antenne: "Vie de l'antenne",
  poste_de_secours: 'Poste de secours'
};


export const MISSION_TYPE_SLUG_TO_ID: Record<MissionCategory, string> = {
  maraude: 'aaaaaaaa-0000-0000-0000-000000000001',
  garde: 'aaaaaaaa-0000-0000-0000-000000000002',
  formation: 'aaaaaaaa-0000-0000-0000-000000000003',
  vie_antenne: 'aaaaaaaa-0000-0000-0000-000000000004',
  poste_de_secours: 'aaaaaaaa-0000-0000-0000-000000000005',
};

export const MISSION_TYPE_ID_TO_SLUG: Record<string, MissionCategory> = Object.fromEntries(
  Object.entries(MISSION_TYPE_SLUG_TO_ID).map(([slug, id]) => [id, slug as MissionCategory])
);

export function getMissionCategory(missionTypeId: string): MissionCategory {
  return MISSION_TYPE_ID_TO_SLUG[missionTypeId] ?? 'maraude';
}

export const MISSION_TYPE_OPTIONS: Array<{ value: string; label: string; slug: MissionCategory }> = [
  { value: 'aaaaaaaa-0000-0000-0000-000000000001', label: 'Maraude', slug: 'maraude' },
  { value: 'aaaaaaaa-0000-0000-0000-000000000002', label: 'Garde', slug: 'garde' },
  { value: 'aaaaaaaa-0000-0000-0000-000000000003', label: 'Formation', slug: 'formation' },
  { value: 'aaaaaaaa-0000-0000-0000-000000000004', label: "Vie de l'antenne", slug: 'vie_antenne' },
  { value: 'aaaaaaaa-0000-0000-0000-000000000005', label: 'Poste de secours', slug: 'poste_de_secours' },
];

export type Mission = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;

  mission_type_id: string;
  starts_at: string;
  ends_at: string;
  required_volunteers: number;
  status: MissionStatus;
  created_by: string;
  created_at: string;
  do_status?: string | null;
  retained_status?: string | null;
  requirements_notes?: string | null;
  equipment_notes?: string | null;
  source_type_label?: string | null;
  reversion_expected?: number | null;
  reversion_actual?: number | null;
  validation_date?: string | null;
  raw_import_payload?: Record<string, unknown> | null;
  import_batch_id?: string | null;
  slack_channel_id?: string | null;
  slack_channel_name?: string | null;
  slack_channel_created_at?: string | null;
};

export type MissionRequiredSkill = {
  id: string;
  mission_id: string;
  skill_id: string | null;
  quantity: number;
  created_at: string;
  skill: Pick<Skill, 'id' | 'name' | 'category_id' | 'display_order'> | null;
};

export type MissionProposalStatus = 'pending' | 'accepted' | 'refused';
export type MissionProposalResponse = 'no_response' | 'available' | 'unavailable';
export type MissionProposalSource = 'volunteer' | 'admin';

export type MissionProposal = {
  id: string;
  mission_id: string;
  volunteer_id: string;
  proposed_by: string;
  response: MissionProposalResponse;
  status: MissionProposalStatus;
  decided_at: string | null;
  decided_by: string | null;
  updated_by_admin: boolean;
  updated_by: string | null;
  responded_at?: string | null;
  updated_at: string;
  source: MissionProposalSource;
  created_at: string;
};

export type MissionAssignmentStatus = 'selected' | 'confirmed' | 'declined' | 'replaced';

export type MissionAssignment = {
  id: string;
  mission_id: string;
  volunteer_id: string;
  mission_required_skill_id: string | null;
  assignment_status: MissionAssignmentStatus;
  created_at: string;
};

export type ActivityLogActionType =
  | 'mission_created'
  | 'mission_status_changed'
  | 'proposal_response_updated'
  | 'volunteer_selected'
  | 'volunteer_removed';

export type ActivityLog = {
  id: string;
  mission_id: string | null;
  actor_id: string | null;
  action_type: ActivityLogActionType;
  entity_type: string;
  entity_id: string | null;
  description: string;
  created_at: string;
};

export type Event = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  created_by: string;
  created_at: string;
};

export type MissionTypeRequiredSkill = {
  id: string;
  mission_type_id: string;
  skill_id: string;
  quantity: number;
  created_at: string;
  skill: Pick<Skill, 'id' | 'name' | 'category_id' | 'display_order'> | null;
};

export type MissionType = {
  id: string;
  name: string;
  description: string | null;
  default_required_volunteers: number;
  default_start_time: string | null;
  default_end_time: string | null;
  created_at: string;
  color: string | null;
  required_skills?: MissionTypeRequiredSkill[];
};

export type RoleBehaviorType = 'can_create' | 'can_manage' | 'required_for_visibility' | 'auto_slack' | 'can_see';

export type Role = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
};

export type RoleBehavior = {
  id: string;
  role_id: string;
  behavior_type: RoleBehaviorType;
  mission_type_ids: string[];
  mission_statuses: string[];
  created_at: string;
};

export type ProfileRole = {
  id: string;
  profile_id: string;
  role_id: string;
  created_at: string;
};

export type ActivityAct = {
  profileId: string;
  profileName: string;
  typeName: string;
  missionId: string;
  missionTitle: string;
  missionDate: string;
  hours: number;
};

// ── Cursus / Doublure system ─────────────────────────────────

export type Cursus = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  level: number | null;
  skill_id: string | null;
  signoff_role: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CursusRule = {
  id: string;
  cursus_id: string;
  text: string;
  auto: boolean;
  order_idx: number;
  created_at: string;
};

export type CursusPhase = {
  id: string;
  cursus_id: string;
  kind: 'pre' | 'post';
  label: string;
  sub: string | null;
  provisional: boolean;
  min_doublures: number;
  min_externe: number;
  order_idx: number;
  created_at: string;
  competences?: CursusCompetence[];
};

export type CursusCompetence = {
  id: string;
  phase_id: string;
  name: string;
  description: string | null;
  garde_only: boolean;
  order_idx: number;
  created_at: string;
};

export type VolunteerCursus = {
  id: string;
  profile_id: string;
  cursus_id: string;
  enrolled_at: string;
  completed_at: string | null;
  cursus?: Cursus;
};

export type Doublure = {
  id: string;
  volunteer_cursus_id: string;
  phase_id: string;
  mission_id: string | null;
  event_name: string | null;
  event_date: string | null;
  event_lieu: string | null;
  is_external: boolean;
  supervisor_id: string | null;
  supervisor_name: string | null;
  supervisor_antenne: string | null;
  message: string | null;
  is_pending: boolean;
  declared_by: string;
  created_at: string;
};

export type CompetenceValidation = {
  id: string;
  volunteer_cursus_id: string;
  competence_id: string;
  doublure_id: string | null;
  mission_id: string | null;
  event_name: string | null;
  event_date: string | null;
  event_lieu: string | null;
  supervisor_id: string | null;
  supervisor_name: string | null;
  supervisor_antenne: string | null;
  declared_by: string;
  validated_at: string;
};
