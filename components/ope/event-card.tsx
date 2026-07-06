'use client';

import type { OpeMission } from '@/lib/types';
import { resolveMissionTypeColor, formatMissionDuration } from '@/lib/mission-timeline';
import { formatMissionRequirementLabel } from '@/lib/missions';
import { SkillBadge } from '@/components/skills/skill-badge';
import type { ConflictInfo } from '@/lib/ope-dashboard';
import { Avatar, ConflictMark, EffectifBadge, MaterielChip, StatusBadge, formatTimeRange } from '@/components/ope/atoms';
import { Icon } from '@/components/ui/icon';

export function EventCard({
  mission,
  conflicts,
  onOpen,
}: {
  mission: OpeMission;
  conflicts: Map<string, ConflictInfo>;
  onOpen: (mission: OpeMission) => void;
}) {
  const accent = resolveMissionTypeColor(mission.type.name, mission.type.color);

  return (
    <button
      type="button"
      onClick={() => onOpen(mission)}
      className="relative w-full overflow-hidden rounded-[15px] border border-line bg-surface-card p-[13px_14px_13px_17px] text-left shadow-card transition hover:-translate-y-px hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.05em]" style={{ color: accent }}>
          {mission.type.name ?? 'Événement'}
        </span>
        <StatusBadge status={mission.status} />
      </div>

      <h3 className="mb-1.5 text-[15px] font-bold leading-[1.25] text-ink">{mission.title}</h3>

      <dl className="mb-2.5 flex flex-col gap-[3px] text-[12.5px] text-ink-2">
        <div className="flex items-center gap-1.5">
          <Icon name="schedule" size={15} className="text-ink-3" />
          <span>
            {formatTimeRange(mission.starts_at, mission.ends_at)}{' '}
            <span className="text-ink-3">({formatMissionDuration(mission.starts_at, mission.ends_at)})</span>
          </span>
        </div>
        {mission.location ? (
          <div className="flex items-center gap-1.5">
            <Icon name="location_on" size={15} className="text-ink-3" />
            <span className="truncate">{mission.location}</span>
          </div>
        ) : null}
      </dl>

      {/* Besoins */}
      {mission.requiredSkills.length > 0 ? (
        <div className="mb-2.5 flex flex-wrap gap-[5px]">
          {mission.requiredSkills.map((rs) => (
            <span
              key={rs.id}
              className="inline-flex rounded-full border border-line-field bg-surface-sub px-2 py-0.5 text-[10.5px] font-semibold text-ink-2"
            >
              {formatMissionRequirementLabel(rs.skill?.name, rs.quantity)}
            </span>
          ))}
        </div>
      ) : null}

      {/* Équipe engagée (toujours visible) */}
      <div className="border-t border-line-row pt-[9px]">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-ink-3">Engagés</span>
          <EffectifBadge engaged={mission.team.length} required={mission.required_volunteers} />
        </div>
        {mission.team.length === 0 ? (
          <p className="text-[12px] italic text-ink-3">Aucun secouriste engagé</p>
        ) : (
          <ul className="flex flex-col gap-[7px]">
            {mission.team.map((member) => {
              const conflict = conflicts.get(member.volunteer_id);
              return (
                <li key={member.volunteer_id} className="flex items-center gap-[7px]">
                  <Avatar name={member.full_name} avatarUrl={member.avatar_url} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-2">
                    {member.full_name ?? 'Bénévole'}
                  </span>
                  {conflict ? <ConflictMark label={conflict.label} /> : null}
                  {member.assignedSkill ? (
                    <SkillBadge name={member.assignedSkill.name} color={member.assignedSkill.color} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Matériel engagé (contenants affectés) */}
      {mission.materiel.length > 0 ? (
        <div className="mt-[9px] border-t border-line-row pt-[9px]">
          <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-ink-3">
            Matériel engagé
          </div>
          <div className="flex flex-wrap gap-[5px]">
            {mission.materiel.map((item) => (
              <MaterielChip key={item.container_type_id} name={item.name} code={item.code} tone="engaged" />
            ))}
          </div>
        </div>
      ) : null}
    </button>
  );
}
