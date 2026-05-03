export type AppRole = 'admin' | 'responsable' | 'benevole';

export type Profile = {
  id: string;
  full_name: string | null;
  email: string;
  role: AppRole;
  phone?: string | null;
  sector: string | null;
  created_at: string;
  slack_user_id?: string | null;
  slack_team_id?: string | null;
  slack_username?: string | null;
  slack_connected_at?: string | null;
};

export type Skill = {
  id: string;
  name: string;
  category: string | null;
  level: string | null;
  created_at: string;
};

export type ProfileSkill = {
  profile_id: string;
  skill_id: string;
  created_at: string;
  skill: Pick<Skill, 'id' | 'name'> | null;
};

export type MissionStatus = 'draft' | 'proposed' | 'closed' | 'confirmed' | 'cancelled';

export type MissionCategory = 'maraude' | 'garde' | 'formation' | 'vie_antenne' | 'poste_de_secours';

export const MISSION_CATEGORY_OPTIONS: Array<{ value: MissionCategory; label: string }> = [
  { value: 'maraude', label: 'Maraude' },
  { value: 'garde', label: 'Garde' },
  { value: 'formation', label: 'Formation' },
  { value: 'vie_antenne', label: "Vie de l’antenne" },
  { value: 'poste_de_secours', label: 'Poste de secours' }
];

export const MISSION_CATEGORY_LABELS: Record<MissionCategory, string> = {
  maraude: 'Maraude',
  garde: 'Garde',
  formation: 'Formation',
  vie_antenne: "Vie de l’antenne",
  poste_de_secours: 'Poste de secours'
};

export type Mission = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  sector: string | null;
  category: MissionCategory;
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
  skill: Pick<Skill, 'id' | 'name'> | null;
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
