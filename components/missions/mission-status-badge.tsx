import { getMissionStatusBadgeClass, MISSION_STATUS_LABELS } from '@/lib/missions';
import { MissionStatus } from '@/lib/types';

type MissionStatusBadgeProps = {
  status: MissionStatus;
};

export function MissionStatusBadge({ status }: MissionStatusBadgeProps) {
  return (
    <span className={`rounded border px-2 py-1 text-xs font-medium uppercase ${getMissionStatusBadgeClass(status)}`}>
      {MISSION_STATUS_LABELS[status]}
    </span>
  );
}
