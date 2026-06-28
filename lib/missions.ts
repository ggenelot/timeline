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
    not_started: 'border-slate-300 bg-slate-100 text-slate-700',
    in_progress: 'border-amber-200 bg-amber-50 text-amber-700',
    completed: 'border-emerald-200 bg-emerald-50 text-emerald-700'
  };

  return statusClassMap[status];
}

export function getMissionStatusBadgeClass(status: MissionStatus) {
  const statusClassMap: Record<MissionStatus, string> = {
    draft: 'border-slate-300 bg-slate-100 text-slate-700',
    proposed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    closed: 'border-slate-300 bg-slate-100 text-slate-700',
    confirmed: 'border-amber-200 bg-amber-50 text-amber-700',
    cancelled: 'border-rose-200 bg-rose-50 text-rose-700'
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
