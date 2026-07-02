import { MissionMaterielVerificationStatus, MissionProposalResponse, MissionStatus } from '@/lib/types';

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  draft: 'Brouillon',
  proposed: 'Proposé',
  closed: 'Clôturé',
  confirmed: 'Confirmé',
  cancelled: 'Annulé'
};

export const MISSION_VERIFICATION_STATUS_LABELS: Record<MissionMaterielVerificationStatus, string> = {
  not_started: 'À vérifier',
  in_progress: 'En cours',
  completed: 'Vérifiée'
};

export function getMissionVerificationStatusBadgeClass(status: MissionMaterielVerificationStatus) {
  const statusClassMap: Record<MissionMaterielVerificationStatus, string> = {
    not_started: 'border-line bg-surface-sub text-ink-2',
    in_progress: 'border-warn-line bg-warn-soft text-warn-text',
    completed: 'border-ok-line bg-ok-soft text-ok-text'
  };

  return statusClassMap[status];
}

export function getMissionStatusBadgeClass(status: MissionStatus) {
  const statusClassMap: Record<MissionStatus, string> = {
    draft: 'border-warn-line bg-warn-soft text-warn-text',
    proposed: 'border-[#CFDDF6] bg-[#E7EEFB] text-[#1E3C87]',
    closed: 'border-line bg-surface-sub text-ink-2',
    confirmed: 'border-ok-line bg-ok-soft text-ok-text',
    cancelled: 'border-bad/30 bg-bad-soft text-bad'
  };

  return statusClassMap[status];
}

export function getProposalResponseLabel(response: MissionProposalResponse | null) {
  if (!response) {
    return 'Aucune réponse';
  }

  const labels: Record<MissionProposalResponse, string> = {
    no_response: 'Aucune réponse',
    available: 'Oui',
    unavailable: 'Non'
  };

  return labels[response];
}

export function formatMissionRequirementLabel(skillName: string | null | undefined, quantity: number) {
  const safeQuantity = Number.isFinite(quantity) ? Math.max(1, Math.trunc(quantity)) : 1;

  if (!skillName) {
    return `${safeQuantity} bénévole${safeQuantity > 1 ? 's' : ''}`;
  }

  return `${safeQuantity} ${skillName}`;
}
