import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ProposalButton } from '@/components/missions/proposal-button';
import { SkillBadge } from '@/components/skills/skill-badge';
import { MissionCardShell } from '@/components/missions/mission-card-shell';
import {
  Mission,
  MissionProposalResponse,
  MissionRequiredSkill
} from '@/lib/types';

type MissionCardProps = {
  mission: Mission;
  missionTypeName?: string;
  requiredSkills: MissionRequiredSkill[];
  formatMissionRequirementLabel: (skillName: string | undefined, quantity: number) => string;
  currentUserId: string;
  canPropose: boolean;
  proposalResponse: MissionProposalResponse | null;
  canEdit: boolean;
  availableVolunteersCount: number;
  unavailableVolunteersCount: number;
  availableVolunteers: Array<{ name: string; skills: Array<{ name: string; category: string | null }> }>;
  onPublishDraft?: (missionId: string) => Promise<void>;
  onResponse?: () => void;
};

const MISSION_STATUS_LABELS = {
  draft: 'Brouillon',
  proposed: 'Proposé',
  closed: 'Clos',
  confirmed: 'Confirmé',
  cancelled: 'Annulé'
} as const;


const MISSION_STATUS_STYLES: Record<Mission['status'], { cardClassName: string; statusBadgeClassName: string }> = {
  draft: {
    cardClassName: 'border-l-4 border-l-amber-400',
    statusBadgeClassName: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200'
  },
  proposed: {
    cardClassName: 'border-l-4 border-l-sky-400',
    statusBadgeClassName: 'bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200'
  },
  confirmed: {
    cardClassName: 'border-l-4 border-l-emerald-400',
    statusBadgeClassName: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200'
  },
  closed: {
    cardClassName: 'border-l-4 border-l-slate-400',
    statusBadgeClassName: 'bg-slate-200 text-slate-700 ring-1 ring-inset ring-slate-300'
  },
  cancelled: {
    cardClassName: 'border-l-4 border-l-rose-400',
    statusBadgeClassName: 'bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200'
  }
};

export function MissionCard({
  mission,
  missionTypeName,
  requiredSkills,
  formatMissionRequirementLabel,
  currentUserId,
  canPropose,
  proposalResponse,
  canEdit,
  availableVolunteersCount,
  unavailableVolunteersCount: _unavailableVolunteersCount,
  availableVolunteers,
  onPublishDraft,
  onResponse
}: MissionCardProps) {
  const [selectedSkillFilter, setSelectedSkillFilter] = useState('all');

  const skillFilters = useMemo(() => {
    if (requiredSkills.length === 0) {
      return [];
    }

    return requiredSkills
      .map((requiredSkill) => requiredSkill.skill?.name?.trim())
      .filter((skillName): skillName is string => Boolean(skillName))
      .map((skillName) => ({
        name: skillName,
        count: availableVolunteers.filter((volunteer) => volunteer.skills.some((skill) => skill.name === skillName)).length
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  }, [availableVolunteers, requiredSkills]);

  const filteredAvailableVolunteers = useMemo(() => {
    if (selectedSkillFilter === 'all') return availableVolunteers;
    return availableVolunteers.filter((volunteer) => volunteer.skills.some((skill) => skill.name === selectedSkillFilter));
  }, [availableVolunteers, selectedSkillFilter]);

  const doStatusLabel = mission.do_status?.trim() || 'Antenne En attente';
  const missionStatusStyle = MISSION_STATUS_STYLES[mission.status];
  return (
    <MissionCardShell
      headerLeft={(
        <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs font-bold text-white">{missionTypeName ?? '—'}</span>
      )}
      className={missionStatusStyle.cardClassName}
      headerRight={(
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${missionStatusStyle.statusBadgeClassName}`}>
            {MISSION_STATUS_LABELS[mission.status]}
          </span>
          <span className="text-xs text-slate-600">{doStatusLabel}</span>
        </div>
      )}
      title={mission.title}
      metadata={
        <>
          {new Date(mission.starts_at).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} •{' '}
          {new Date(mission.starts_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} à{' '}
          {new Date(mission.ends_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} • Lieu : {mission.location ?? 'Non défini'}
        </>
      }
      location={null}
      description={mission.description ?? 'Aucune description'}
      requirements={
        requiredSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {requiredSkills.map((requiredSkill) => (
              <span key={requiredSkill.id} className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">
                {formatMissionRequirementLabel(requiredSkill.skill?.name, requiredSkill.quantity)}
              </span>
            ))}
          </div>
        ) : null
      }
      actions={
        <>
          <div className="relative z-10 flex flex-wrap items-center justify-end gap-3">
            {canEdit ? (
              <>
                {mission.status === 'draft' && onPublishDraft ? (
                  <button
                    type="button"
                    onClick={() => void onPublishDraft(mission.id)}
                    className="pointer-events-auto inline-flex rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm text-emerald-700 hover:bg-emerald-100"
                  >
                    Passer en proposé
                  </button>
                ) : null}
                <Link href={`/missions/${mission.id}`} className="pointer-events-auto inline-flex rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-100">
                  Gérer
                </Link>
              </>
            ) : null}
          </div>

          {canPropose ? (
            <ProposalButton missionId={mission.id} volunteerId={currentUserId} disabled={false} missionStatus={mission.status} currentResponse={proposalResponse} onResponse={onResponse} />
          ) : null}
        </>
      }
      footer={
        <>
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="text-sm font-semibold text-slate-700">Personnes disponibles</div>
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{availableVolunteersCount} disponibles</span>
          </div>
          {skillFilters.length > 0 ? (
            <div className="mb-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-600">Filtrer par compétence requise :</span>
                <button
                  type="button"
                  onClick={() => setSelectedSkillFilter('all')}
                  className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                    selectedSkillFilter === 'all' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Toutes {availableVolunteers.length}
                </button>
                {skillFilters.map((skill) => (
                  <button
                    key={skill.name}
                    type="button"
                    onClick={() => setSelectedSkillFilter(skill.name)}
                    className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                      selectedSkillFilter === skill.name ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {skill.name} {skill.count}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {filteredAvailableVolunteers.length > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-x-1">
              {filteredAvailableVolunteers.map((volunteer, index) => (
                <span key={`${volunteer.name}-${index}`} className="group relative inline-flex items-center">
                  <span className="cursor-help underline decoration-dotted underline-offset-2">{volunteer.name}</span>
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-max max-w-72 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-md group-hover:block">
                    {volunteer.skills.length > 0 ? (
                      <span className="inline-flex flex-wrap gap-1">
                        {volunteer.skills.map((skill) => (
                          <SkillBadge key={`${volunteer.name}-${skill.name}`} name={skill.name} category={skill.category} />
                        ))}
                      </span>
                    ) : (
                      'Aucune compétence renseignée'
                    )}
                  </span>
                  {index < filteredAvailableVolunteers.length - 1 ? ',' : ''}
                </span>
              ))}
            </span>
          ) : (
            'Aucun bénévole disponible'
          )}
        </>
      }
    />
  );
}
