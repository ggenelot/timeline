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


const MISSION_STATUS_STYLES: Record<Mission['status'], { cardClassName: string; railClassName: string }> = {
  draft: {
    cardClassName: 'pl-10',
    railClassName: 'bg-amber-400 text-amber-950'
  },
  proposed: {
    cardClassName: 'pl-10',
    railClassName: 'bg-sky-400 text-sky-950'
  },
  confirmed: {
    cardClassName: 'pl-10',
    railClassName: 'bg-emerald-400 text-emerald-950'
  },
  closed: {
    cardClassName: 'pl-10',
    railClassName: 'bg-slate-400 text-slate-950'
  },
  cancelled: {
    cardClassName: 'pl-10',
    railClassName: 'bg-rose-400 text-rose-950'
  }
};

export function MissionCard({
  mission,
  missionTypeName,
  requiredSkills,
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
      .map((skillName) => {
        const requirement = requiredSkills.find((requiredSkill) => requiredSkill.skill?.name?.trim() === skillName);
        const availableCount = availableVolunteers.filter((volunteer) => volunteer.skills.some((skill) => skill.name === skillName)).length;

        return {
          name: skillName,
          availableCount,
          requiredCount: requirement?.quantity ?? 0
        };
      })
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
        <>
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[11px] font-bold text-white">{missionTypeName ?? '—'}</span>
          <h2 className="text-sm font-semibold text-slate-900">{mission.title}</h2>
        </>
      )}
      compact
      className={missionStatusStyle.cardClassName}
      statusRail={(
        <div className={`flex h-full w-full items-center justify-center ${missionStatusStyle.railClassName}`}>
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] [writing-mode:vertical-rl] [text-orientation:mixed]">
            {MISSION_STATUS_LABELS[mission.status]}
          </span>
        </div>
      )}
      headerRight={<span className="text-[11px] text-slate-600">{doStatusLabel}</span>}
      title={null}
      metadata={
        <>
          {new Date(mission.starts_at).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} •{' '}
          {new Date(mission.starts_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} à{' '}
          {new Date(mission.ends_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} • Lieu : {mission.location ?? 'Non défini'}
        </>
      }
      location={null}
      description={mission.description?.trim() ? mission.description : null}
      requirements={null}
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
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-slate-700">Personnes disponibles ({availableVolunteersCount})</div>
            {skillFilters.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedSkillFilter('all')}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                    selectedSkillFilter === 'all' ? 'border-slate-600 bg-slate-600 text-white' : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Toutes {availableVolunteers.length}
                </button>
                {skillFilters.map((skill) => (
                  <button
                    key={skill.name}
                    type="button"
                    onClick={() => setSelectedSkillFilter(skill.name)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                      selectedSkillFilter === skill.name
                        ? 'border-slate-600 bg-slate-600 text-white'
                        : skill.availableCount > skill.requiredCount
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {skill.name} {skill.availableCount}/{skill.requiredCount}
                  </button>
                ))}
              </>
            ) : null}
          </div>
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
