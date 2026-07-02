import { MissionProposalStatus } from '@/lib/types';

type StatusBadgeProps = {
  status: MissionProposalStatus;
};

const labels: Record<MissionProposalStatus, string> = {
  pending: 'En attente',
  accepted: 'Acceptée',
  refused: 'Refusée'
};

const classes: Record<MissionProposalStatus, string> = {
  pending: 'border-warn-line bg-warn-soft text-warn-text',
  accepted: 'border-ok-line bg-ok-soft text-ok-text',
  refused: 'border-bad/30 bg-bad-soft text-bad'
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}
