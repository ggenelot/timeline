import { MissionProposalResponse, MissionStatus } from '@/lib/types';

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  draft: 'Brouillon',
  proposed: 'Proposé',
  closed: 'Clôturé',
  confirmed: 'Confirmé',
  cancelled: 'Annulé'
};

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
