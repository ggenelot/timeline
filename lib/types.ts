export type AppRole = 'admin' | 'responsable' | 'benevole';

export type Profile = {
  id: string;
  full_name: string | null;
  email: string;
  identifier?: string | null;
  role: AppRole;
  sector?: string | null;
  created_at: string;
  slack_user_id?: string | null;
  slack_team_id?: string | null;
  slack_username?: string | null;
  slack_connected_at?: string | null;
  avatar_url?: string | null;
};

// Réglages de charte graphique (logo, couleurs, polices), éditables depuis
// /admin/apparence — voir lib/branding/. Table singleton `app_settings`.
export type AppSettings = {
  logoUrl: string | null;
  brandColor: string;
  accentColor: string;
  fontSans: string | null;
  fontDisplay: string | null;
  fontHand: string | null;
  orgName: string;
  orgTagline: string;
  loginGreeting: string;
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
  code?: string | null;
  description?: string | null;
  level?: number | null;
  created_at: string;
  category?: SkillCategory | null;
};

// Statuts de compétence configurables (page d'admin « Compétences »). La clé
// 'valide' est protégée car d'autres parties du produit (éligibilité aux
// missions, fonction SQL `user_has_cp_skill`) s'appuient sur `is_validating`.
export type SkillStatus = {
  id: string;
  key: string;
  label: string;
  color: string;
  mark: string;
  is_validating: boolean;
  protected: boolean;
  display_order: number;
  created_at: string;
};

export type ProfileSkill = {
  profile_id: string;
  skill_id: string;
  status?: string;
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

// ── Matériel (catalogue générique, indépendant du domaine métier) ──────

export type MaterielCategory = {
  id: string;
  name: string;
  color: string;
  display_order: number;
  created_at: string;
};

export type MaterielType = {
  id: string;
  name: string;
  category_id?: string | null;
  code?: string | null;
  description?: string | null;
  is_container: boolean;
  // Disponibilité globale du contenant (panne, maintenance…). N'a de sens que
  // pour les contenants ; les items la portent aussi mais ne l'exposent pas.
  is_available: boolean;
  unavailable_reason?: string | null;
  display_order: number;
  created_at: string;
  category?: MaterielCategory | null;
  containers?: string[];
};

export type MaterielTypeContent = {
  id: string;
  parent_type_id: string;
  child_type_id: string;
  quantity: number;
  position: number;
  created_at: string;
  child_type?: Pick<MaterielType, 'id' | 'name' | 'code' | 'is_container' | 'category_id' | 'category'> | null;
};

// Affecte un contenant précis du catalogue à un besoin de mission exprimé en
// catégorie (ex. "2x VPS" → assigner "VPS La Boétie" puis "VPS Étoile").
export type MissionMaterielAssignment = {
  id: string;
  mission_required_materiel_id: string;
  materiel_type_id: string;
  assigned_by: string | null;
  created_at: string;
  materiel_type?: Pick<MaterielType, 'id' | 'name' | 'code'> | null;
};

export type MissionRequiredMateriel = {
  id: string;
  mission_id: string;
  category_id: string;
  quantity: number;
  created_at: string;
  category?: Pick<MaterielCategory, 'id' | 'name' | 'color'> | null;
  assignments?: MissionMaterielAssignment[];
};

export type MissionTypeRequiredMateriel = {
  id: string;
  mission_type_id: string;
  category_id: string;
  quantity: number;
  created_at: string;
  category?: Pick<MaterielCategory, 'id' | 'name' | 'color'> | null;
};

// ── Vérification assistée du matériel ──────────────────────────────────

export type MissionMaterielVerificationStatus = 'not_started' | 'in_progress' | 'completed';
export type MissionMaterielVerificationItemStatus = 'present' | 'partial' | 'missing';

export type MissionMaterielVerification = {
  id: string;
  mission_id: string;
  status: MissionMaterielVerificationStatus;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MissionMaterielVerificationItem = {
  id: string;
  mission_id: string;
  mission_materiel_assignment_id: string;
  child_type_id: string;
  status: MissionMaterielVerificationItemStatus;
  quantity_present: number | null;
  note: string | null;
  checked_by: string;
  checked_at: string;
};

// Un item à vérifier, aplati pour l'écran de pile de cartes : un contenant
// précis affecté à un besoin de mission, et un des items catalogue qu'il
// doit contenir.
export type MissionVerificationCard = {
  mission_materiel_assignment_id: string;
  mission_required_materiel_id: string;
  category_name: string;
  container_type_id: string;
  container_name: string;
  child_type_id: string;
  child_name: string;
  expected_quantity: number;
  check: Pick<MissionMaterielVerificationItem, 'status' | 'note' | 'quantity_present'> | null;
};

export type MissionVerificationDetail = {
  mission_id: string;
  verification: MissionMaterielVerification | null;
  cards: MissionVerificationCard[];
};

// Statut d'un matériel (une affectation) sur l'écran « Mes missions » : dérivé
// des items pointés plutôt que stocké, en plus du not_started/in_progress/
// completed classique on distingue 'missing' dès qu'un item manquant a été
// relevé, même une fois tout le matériel pointé.
export type MissionVerificationMaterielStatus = 'not_started' | 'in_progress' | 'missing' | 'completed';

export type MissionVerificationMaterielSummary = {
  mission_materiel_assignment_id: string;
  name: string;
  total_items: number;
  checked_items: number;
  status: MissionVerificationMaterielStatus;
};

export type MissionVerificationSummary = {
  mission_id: string;
  title: string;
  category: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  materiels: MissionVerificationMaterielSummary[];
};

// ── Arborescence de vérification scopée à un matériel (écran 2) ────────
// Un contenant affecté peut lui-même contenir des sous-contenants ; l'arbre
// reflète la composition catalogue (materiel_type_contents) sous cette
// affectation précise, avec le pointage déjà enregistré sur chaque item.

export type VerificationTreeItemNode = {
  kind: 'item';
  id: string;
  child_type_id: string;
  name: string;
  quantity: number;
  check: Pick<MissionMaterielVerificationItem, 'status' | 'note' | 'quantity_present'> | null;
};

export type VerificationTreeContainerNode = {
  kind: 'container';
  id: string;
  materiel_type_id: string;
  name: string;
  children: VerificationTreeNode[];
  totalItems: number;
  checkedItems: number;
  missingItems: number;
};

export type VerificationTreeNode = VerificationTreeItemNode | VerificationTreeContainerNode;

export type MissionVerificationTree = {
  mission_id: string;
  mission_title: string;
  assignment_id: string;
  root: VerificationTreeContainerNode;
};

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
  required_materiels?: MissionTypeRequiredMateriel[];
};

export type RoleBehaviorType = 'can_create' | 'can_manage' | 'required_for_visibility' | 'auto_slack' | 'can_see';
export type RoleBehaviorResourceType = 'mission' | 'cursus';

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
  resource_type: RoleBehaviorResourceType;
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
  kind: 'pre' | 'post' | null;
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
  supervisor_comment: string | null;
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

// ── Tableau de bord OPE ───────────────────────────────────────────
// Données dénormalisées renvoyées par /api/admin/ope-dashboard pour le
// board de pilotage opérationnel (un événement = une mission).
export type OpeSkill = {
  id: string;
  name: string;
  color: string | null; // couleur nommée de la catégorie (cf. SkillBadge)
};

export type OpeTeamMember = {
  volunteer_id: string;
  full_name: string | null;
  assignment_status: string;
  // Rôle tenu sur ce dispositif (compétence du mission_required_skill affecté).
  assignedSkill: OpeSkill | null;
  validatedSkills: OpeSkill[];
};

export type OpeRequiredSkill = {
  id: string;
  quantity: number;
  skill: OpeSkill | null;
};

export type OpeMissionType = { name: string | null; color: string | null };

// ── Matériel sur le board OPE ──────────────────────────────────────
export type OpeMaterielCategoryRef = { id: string; name: string; color: string | null };

// Un contenant engagé (affecté) sur une mission de la fenêtre.
export type OpeEngagedMateriel = {
  container_type_id: string;
  name: string;
  code: string | null;
  category: OpeMaterielCategoryRef | null;
};

// Un contenant racine du catalogue (unité engageable), avec sa disponibilité.
export type OpeContainer = {
  id: string;
  name: string;
  code: string | null;
  is_available: boolean;
  unavailable_reason: string | null;
  category: OpeMaterielCategoryRef | null;
};

export type OpeMission = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  status: MissionStatus;
  required_volunteers: number;
  type: OpeMissionType;
  requiredSkills: OpeRequiredSkill[];
  team: OpeTeamMember[];
  materiel: OpeEngagedMateriel[];
};

// Secouriste disponible (response='available') sur une mission de la fenêtre.
export type OpeAvailabilityEntry = {
  mission_id: string;
  volunteer_id: string;
  full_name: string | null;
  validatedSkills: OpeSkill[];
};

export type OpeVolunteerRef = { id: string; full_name: string | null };

export type OpeDashboardData = {
  from: string;
  days: number;
  missions: OpeMission[];
  availability: OpeAvailabilityEntry[];
  volunteers: OpeVolunteerRef[];
  // Catalogue des contenants racines (unités engageables) + disponibilité,
  // pour la section "matériel engagé / dispo / indispo par jour".
  containers: OpeContainer[];
};

// Activité (engagement) d'une personne, pour la recherche par secouriste.
export type OpePersonActivity = {
  mission_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: MissionStatus;
  type: OpeMissionType;
  assignment_status: string;
  assignedSkill: OpeSkill | null;
};
