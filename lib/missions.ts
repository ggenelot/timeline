import { BadgeTone } from '@/components/ui/badge';
import { MissionVerificationMaterielStatus, MissionProposalResponse, MissionStatus } from '@/lib/types';

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  draft: 'Brouillon',
  proposed: 'Proposé',
  closed: 'Clôturé',
  confirmed: 'Confirmé',
  cancelled: 'Annulé'
};

// Statut d'un matériel affecté à une mission, tel qu'affiché sur « Mes
// missions » et sur l'écran de vérification scopée : dérivé des items pointés
// (cf. computeMaterielVerificationStatus côté API), pas stocké tel quel.
export const MISSION_VERIFICATION_MATERIEL_STATUS_LABELS: Record<MissionVerificationMaterielStatus, string> = {
  not_started: 'À vérifier',
  in_progress: 'En cours',
  missing: 'Manquant',
  completed: 'Vérifié'
};

export const MISSION_VERIFICATION_MATERIEL_STATUS_TONE: Record<MissionVerificationMaterielStatus, BadgeTone> = {
  not_started: 'neutral',
  in_progress: 'warn',
  missing: 'bad',
  completed: 'ok'
};

export function getMissionVerificationMaterielDotClass(status: MissionVerificationMaterielStatus) {
  const dotClassMap: Record<MissionVerificationMaterielStatus, string> = {
    not_started: 'bg-ink-4',
    in_progress: 'bg-warn-bar',
    missing: 'bg-bad',
    completed: 'bg-ok-bar'
  };

  return dotClassMap[status];
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
