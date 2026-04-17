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
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  refused: 'border-rose-200 bg-rose-50 text-rose-700'
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}
