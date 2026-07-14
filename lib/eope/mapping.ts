// Fonctions PURES de mapping entre le domaine eOPE et le domaine Timeline.
// Aucune I/O ici : tout est testable unitairement (voir mapping.test.ts).

import { MISSION_TYPE_SLUG_TO_ID, type MissionStatus } from '@/lib/types';
import type { EopeEvent } from './types';

// Champs d'une mission dont eOPE est propriétaire : le pull les écrase à
// chaque run. Tout le reste (statut, effectif requis, type après création,
// équipage, dispos…) appartient à Timeline et n'est jamais touché.
export type EopeMissionFields = {
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
};

export function eopeEventToMissionFields(event: EopeEvent): EopeMissionFields {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    starts_at: event.starts_at,
    ends_at: event.ends_at
  };
}

// Même heuristique que l'import de missions (normalizeMissionTypeId,
// app/api/admin/missions/import/route.ts) : rattache le libellé de type eOPE
// à un mission_type connu, avec poste_de_secours en repli. Le libellé
// d'origine est conservé dans missions.source_type_label.
export function mapEopeTypeToMissionTypeId(label: string | null): string {
  if (!label) return MISSION_TYPE_SLUG_TO_ID['poste_de_secours'];

  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (
    normalized.includes('poste de secours') ||
    normalized.includes('poste') ||
    normalized.includes('pds') ||
    normalized.includes('dps')
  ) {
    return MISSION_TYPE_SLUG_TO_ID['poste_de_secours'];
  }
  if (normalized.includes('garde')) return MISSION_TYPE_SLUG_TO_ID['garde'];
  if (normalized.includes('format')) return MISSION_TYPE_SLUG_TO_ID['formation'];
  if (normalized.includes('antenne') || normalized.includes('vie')) return MISSION_TYPE_SLUG_TO_ID['vie_antenne'];
  if (normalized.includes('maraude')) return MISSION_TYPE_SLUG_TO_ID['maraude'];

  return MISSION_TYPE_SLUG_TO_ID['poste_de_secours'];
}

// Une annulation côté eOPE annule la mission liée, sauf si elle est déjà
// passée à l'archive (closed) ou déjà annulée.
export function shouldCancelMission(event: EopeEvent, currentStatus: MissionStatus): boolean {
  return event.cancelled && currentStatus !== 'closed' && currentStatus !== 'cancelled';
}

// ── Diff de réconciliation du push (équipages → engagements validés) ─────

// Un membre d'équipage engagé côté Timeline (assignment selected/confirmed
// sur une mission liée), avec la liaison eOPE de son profil si elle existe.
export type EopeDesiredCommitment = {
  mission_id: string;
  volunteer_id: string;
  eope_event_id: string;
  eope_user_id: string | null;
  full_name: string | null;
};

// Une ligne de eope_commitment_links (état distant enregistré).
export type EopeRecordedCommitment = {
  mission_id: string;
  volunteer_id: string;
  eope_commitment_id: string;
};

export type EopeCommitmentDiff = {
  toCreate: Array<EopeDesiredCommitment & { eope_user_id: string }>;
  toDelete: EopeRecordedCommitment[];
  unchanged: EopeRecordedCommitment[];
  // Engagés dont le profil n'a pas de eope_user_id : rien à pousser, mais
  // l'admin doit le savoir (liste d'avertissement sur /admin/eope).
  skippedUnlinked: EopeDesiredCommitment[];
};

function commitmentKey(item: { mission_id: string; volunteer_id: string }) {
  return `${item.mission_id}:${item.volunteer_id}`;
}

export function computeCommitmentDiff(
  desired: EopeDesiredCommitment[],
  recorded: EopeRecordedCommitment[]
): EopeCommitmentDiff {
  const skippedUnlinked = desired.filter((item) => !item.eope_user_id);
  const linked = desired.filter((item): item is EopeDesiredCommitment & { eope_user_id: string } =>
    Boolean(item.eope_user_id)
  );

  const linkedKeys = new Set(linked.map(commitmentKey));
  const recordedKeys = new Set(recorded.map(commitmentKey));

  return {
    toCreate: linked.filter((item) => !recordedKeys.has(commitmentKey(item))),
    toDelete: recorded.filter((item) => !linkedKeys.has(commitmentKey(item))),
    unchanged: recorded.filter((item) => linkedKeys.has(commitmentKey(item))),
    skippedUnlinked
  };
}
