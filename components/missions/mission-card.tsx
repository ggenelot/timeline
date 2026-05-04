import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ProposalButton } from '@/components/missions/proposal-button';
import { SkillBadge } from '@/components/skills/skill-badge';
import { MissionCardShell } from '@/components/missions/mission-card-shell';
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
  const [selectedSkillFiltersByCategory, setSelectedSkillFiltersByCategory] = useState<Record<string, string>>({});

  const skillCategoryLabels: Record<string, string> = {
    formation: 'Formation',
    accso: 'ACCSO',
    operationnel: 'Opérationnel',
    conduite: 'Conduite',
    technique: 'Technique',
    autre: 'Autres compétences'
  };
  const orderedSkillCategories = ['formation', 'accso', 'operationnel', 'conduite', 'technique', 'autre'];

  const skillFiltersByCategory = useMemo(() => {
    const countsByCategory = new Map<string, Map<string, number>>();

    availableVolunteers.forEach((volunteer) => {
      volunteer.skills.forEach((skill) => {
        const skillName = skill.name.trim();
        if (!skillName) return;

        const category = (skill.category ?? 'autre').trim() || 'autre';
        if (!countsByCategory.has(category)) {
          countsByCategory.set(category, new Map());
        }

        const skillCounts = countsByCategory.get(category)!;
        skillCounts.set(skillName, (skillCounts.get(skillName) ?? 0) + 1);
      });
    });

    const categories = Array.from(countsByCategory.entries())
      .map(([category, skillsMap]) => ({
        category,
        label: skillCategoryLabels[category] ?? category,
        allCount: availableVolunteers.filter((volunteer) =>
          volunteer.skills.some((skill) => ((skill.category ?? 'autre').trim() || 'autre') === category)
        ).length,
        skills: Array.from(skillsMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
      }))
      .sort((a, b) => {
        const indexA = orderedSkillCategories.indexOf(a.category);
        const indexB = orderedSkillCategories.indexOf(b.category);
        if (indexA === -1 && indexB === -1) return a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' });
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });

    return categories;
  }, [availableVolunteers]);

  const filteredAvailableVolunteers = useMemo(() => {
    const activeFilters = Object.entries(selectedSkillFiltersByCategory).filter(([, skill]) => skill !== 'all');
    if (activeFilters.length === 0) return availableVolunteers;

    return availableVolunteers.filter((volunteer) =>
      activeFilters.every(([category, skillName]) =>
        volunteer.skills.some((skill) => (((skill.category ?? 'autre').trim() || 'autre') === category) && skill.name === skillName)
      )
    );
  }, [availableVolunteers, selectedSkillFiltersByCategory]);

  const doStatusLabel = mission.do_status?.trim() || 'Antenne En attente';

  return (
    <MissionCardShell
      headerLeft={(
        <>
          <span
            className={`rounded-full px-3 py-1.5 font-bold ${MISSION_CATEGORY_BADGE_CLASSES[mission.category] ?? 'bg-amber-400 text-slate-900'}`}
          >
            {MISSION_CATEGORY_LABELS[mission.category]}
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500">{MISSION_STATUS_LABELS[mission.status]}</span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500">{doStatusLabel}</span>
        </>
      )}
      headerRight={(
        <>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">{availableVolunteersCount} DISPONIBLES</span>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-400">{unavailableVolunteersCount} INDISPONIBLES</span>
        </>
      )}
      title={mission.title}
      metadata={
        <>
          {new Date(mission.starts_at).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} |{' '}
          {new Date(mission.starts_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} à{' '}
          {new Date(mission.ends_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </>
      }
      location={<>Lieu : {mission.location ?? 'Non défini'}</>}
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
              <Link href={`/missions/${mission.id}`} className="pointer-events-auto inline-flex rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-100">
                Gérer
              </Link>
            ) : null}
          </div>

          {canPropose ? (
            <ProposalButton missionId={mission.id} volunteerId={currentUserId} disabled={false} missionStatus={mission.status} currentResponse={proposalResponse} />
          ) : null}
        </>
      }
      footer={
        <>
          {skillFiltersByCategory.length > 0 ? (
            <div className="mb-3 space-y-2">
              {skillFiltersByCategory.map((categoryFilters) => {
                const selectedSkill = selectedSkillFiltersByCategory[categoryFilters.category] ?? 'all';

                return (
                  <div key={categoryFilters.category} className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{categoryFilters.label} :</span>
                    <button
                      type="button"
                      onClick={() => setSelectedSkillFiltersByCategory((prev) => ({ ...prev, [categoryFilters.category]: 'all' }))}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        selectedSkill === 'all' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Toutes {categoryFilters.allCount}
                    </button>
                    {categoryFilters.skills.map((skill) => (
                      <button
                        key={`${categoryFilters.category}-${skill.name}`}
                        type="button"
                        onClick={() => setSelectedSkillFiltersByCategory((prev) => ({ ...prev, [categoryFilters.category]: skill.name }))}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                          selectedSkill === skill.name ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {skill.name} {skill.count}
                      </button>
                    ))}
                  </div>
                );
              })}
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
        </>
      }
    />
  );
}
