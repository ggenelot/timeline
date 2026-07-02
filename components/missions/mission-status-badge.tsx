import { getMissionStatusBadgeClass, MISSION_STATUS_LABELS } from '@/lib/missions';
import { MissionStatus } from '@/lib/types';

type MissionStatusBadgeProps = {
  status: MissionStatus;
};

export function MissionStatusBadge({ status }: MissionStatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase ${getMissionStatusBadgeClass(status)}`}>
      {MISSION_STATUS_LABELS[status]}
    </span>
  );
}
