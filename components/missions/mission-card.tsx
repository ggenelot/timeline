import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ProposalButton } from '@/components/missions/proposal-button';
import { SkillBadge } from '@/components/skills/skill-badge';
import {
  MISSION_CATEGORY_LABELS,
  Mission,
  MissionProposalResponse,
  MissionRequiredSkill
} from '@/lib/types';

type MissionCardProps = {
  mission: Mission;
  requiredSkills: MissionRequiredSkill[];
  formatMissionRequirementLabel: (skillName: string | undefined, quantity: number) => string;
  currentUserId: string;
  canPropose: boolean;
  proposalResponse: MissionProposalResponse | null;
  canEdit: boolean;
  availableVolunteersCount: number;
  unavailableVolunteersCount: number;
  availableVolunteers: Array<{ name: string; skills: Array<{ name: string; category: string | null }> }>;
};


const MISSION_CATEGORY_BADGE_CLASSES: Record<string, string> = {
  poste_de_secours: 'bg-orange-400 text-slate-900',
  garde: 'bg-red-500 text-white',
  formation: 'bg-blue-900 text-white',
  maraude: 'bg-violet-500 text-white',
  vie_antenne: 'bg-sky-400 text-slate-900'
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
  proposalResponse,
  canEdit,
  availableVolunteersCount,
  unavailableVolunteersCount,
  availableVolunteers
}: MissionCardProps) {
  const [selectedSkillFilter, setSelectedSkillFilter] = useState<string>('all');

  const requiredSkillOptions = useMemo(
    () =>
      requiredSkills
        .map((requiredSkill) => requiredSkill.skill?.name?.trim() ?? '')
        .filter((skillName): skillName is string => Boolean(skillName))
        .filter((skillName, index, array) => array.indexOf(skillName) === index),
    [requiredSkills]
  );

  const filteredAvailableVolunteers = useMemo(() => {
    if (selectedSkillFilter === 'all') {
      return availableVolunteers;
    }

    return availableVolunteers.filter((volunteer) => volunteer.skills.some((skill) => skill.name === selectedSkillFilter));
  }, [availableVolunteers, selectedSkillFilter]);

  const doStatusLabel = mission.do_status?.trim() || 'Antenne En attente';

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/70 shadow-sm">
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span
              className={`rounded-full px-3 py-1.5 font-bold ${MISSION_CATEGORY_BADGE_CLASSES[mission.category] ?? 'bg-amber-400 text-slate-900'}`}
            >
              {MISSION_CATEGORY_LABELS[mission.category]}
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-500">{MISSION_STATUS_LABELS[mission.status]}</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-500">{doStatusLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">{availableVolunteersCount} DISPONIBLES</span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-400">{unavailableVolunteersCount} INDISPONIBLES</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold text-slate-900">{mission.title}</h2>
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
          <div className="flex flex-wrap items-center justify-end gap-3">
            {canEdit ? (
              <Link
                href={`/missions/${mission.id}`}
                className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
              >
                Gérer
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
        </div>
      </div>
      <div className="border-t border-slate-200 bg-white px-5 py-3 text-sm text-slate-500">
        {requiredSkillOptions.length > 0 ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Filtrer par compétence requise :</span>
            <button
              type="button"
              onClick={() => setSelectedSkillFilter('all')}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                selectedSkillFilter === 'all' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              Toutes
            </button>
            {requiredSkillOptions.map((skillName) => (
              <button
                key={skillName}
                type="button"
                onClick={() => setSelectedSkillFilter(skillName)}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  selectedSkillFilter === skillName ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {skillName}
              </button>
            ))}
          </div>
        ) : null}
        Personnes disponibles :{' '}
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
          '-'
        )}
      </div>
    </article>
  );
}
