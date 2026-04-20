import Link from 'next/link';
import { MissionStatusBadge } from '@/components/missions/mission-status-badge';
import { ProposalButton } from '@/components/missions/proposal-button';
import { StatusBadge } from '@/components/missions/status-badge';
import { MISSION_CATEGORY_LABELS, Mission, MissionProposalResponse, MissionProposalStatus } from '@/lib/types';

type MissionCardProps = {
  mission: Mission;
  currentUserId: string;
  canPropose: boolean;
  proposalStatus: MissionProposalStatus | null;
  proposalResponse: MissionProposalResponse | null;
  canEdit: boolean;
};

export function MissionCard({ mission, currentUserId, canPropose, proposalStatus, proposalResponse, canEdit }: MissionCardProps) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{mission.title}</h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
            {MISSION_CATEGORY_LABELS[mission.category]}
          </span>
          <MissionStatusBadge status={mission.status} />
        </div>
      </div>

      <p className="mt-2 text-sm text-slate-700">{mission.description ?? 'Aucune description'}</p>

      <dl className="mt-3 grid gap-1 text-sm text-slate-600 md:grid-cols-2">
        <div>
          <dt className="inline font-medium text-slate-700">Lieu :</dt> {mission.location ?? 'Non défini'}
        </div>
        <div>
          <dt className="inline font-medium text-slate-700">Secteur :</dt> {mission.sector ?? 'Non défini'}
        </div>
        <div>
          <dt className="inline font-medium text-slate-700">Début :</dt> {new Date(mission.starts_at).toLocaleString('fr-FR')}
        </div>
        <div>
          <dt className="inline font-medium text-slate-700">Fin :</dt> {new Date(mission.ends_at).toLocaleString('fr-FR')}
        </div>
      </dl>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/missions/${mission.id}`}
            className="inline-flex rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            Voir le détail
          </Link>

          {canEdit ? (
            <Link
              href={`/admin/missions/${mission.id}/edit`}
              className="inline-flex rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
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
    </article>
  );
}
