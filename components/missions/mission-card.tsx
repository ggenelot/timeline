import Link from 'next/link';
import { MissionStatusBadge } from '@/components/missions/mission-status-badge';
import { ProposalButton } from '@/components/missions/proposal-button';
import { StatusBadge } from '@/components/missions/status-badge';
import {
  MISSION_CATEGORY_LABELS,
  Mission,
  MissionProposalResponse,
  MissionProposalStatus,
  MissionRequiredSkill
} from '@/lib/types';

type MissionCardProps = {
  mission: Mission;
  requiredSkills: MissionRequiredSkill[];
  formatMissionRequirementLabel: (skillName: string | undefined, quantity: number) => string;
  currentUserId: string;
  canPropose: boolean;
  proposalStatus: MissionProposalStatus | null;
  proposalResponse: MissionProposalResponse | null;
  canEdit: boolean;
  availableVolunteersCount: number;
  unavailableVolunteersCount: number;
  availableVolunteerNames: string[];
};

const MISSION_STATUS_LABELS = {
  draft: 'Brouillon',
  proposed: 'Proposé',
  closed: 'Clos',
  confirmed: 'Confirmé',
  cancelled: 'Annulé'
} as const;

export function MissionCard({
  mission,
  requiredSkills,
  formatMissionRequirementLabel,
  currentUserId,
  canPropose,
  proposalStatus,
  proposalResponse,
  canEdit,
  availableVolunteersCount,
  unavailableVolunteersCount,
  availableVolunteerNames
}: MissionCardProps) {
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/70 shadow-sm">
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="rounded-full bg-amber-400 px-3 py-1.5 text-slate-900">{MISSION_CATEGORY_LABELS[mission.category]}</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-500">{MISSION_STATUS_LABELS[mission.status]}</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-500">Antenne En attente</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">{availableVolunteersCount} DISPONIBLES</span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-400">{unavailableVolunteersCount} INDISPONIBLES</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold text-slate-900">{mission.title}</h2>
          <MissionStatusBadge status={mission.status} />
        </div>

        <p className="mt-2 text-sm text-slate-500">
          {new Date(mission.starts_at).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} |{' '}
          {new Date(mission.starts_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} à{' '}
          {new Date(mission.ends_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="mt-2 text-xl text-slate-500">Lieu : {mission.sector ?? 'N/A'} - {mission.location ?? 'Non défini'}</p>

        <p className="mt-2 text-sm text-slate-700">{mission.description ?? 'Aucune description'}</p>

        {requiredSkills.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {requiredSkills.map((requiredSkill) => (
              <span key={requiredSkill.id} className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">
                {formatMissionRequirementLabel(requiredSkill.skill?.name, requiredSkill.quantity)}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/missions/${mission.id}`}
              className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
            >
              Voir le détail
            </Link>

            {canEdit ? (
              <Link
                href={`/admin/missions/${mission.id}/edit`}
                className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
              >
                Modifier
              </Link>
            ) : null}
          </div>

          {canPropose ? (
            <ProposalButton
              missionId={mission.id}
              volunteerId={currentUserId}
              disabled={false}
              missionStatus={mission.status}
              currentResponse={proposalResponse}
            />
          ) : null}

          {proposalStatus ? <StatusBadge status={proposalStatus} /> : null}
        </div>
      </div>
      <div className="border-t border-slate-200 bg-white px-5 py-3 text-sm text-slate-500">
        Personnes disponibles : {availableVolunteerNames.length > 0 ? availableVolunteerNames.join(', ') : '-'}
      </div>
    </article>
  );
}
