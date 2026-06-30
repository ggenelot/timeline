'use client';

import type { OpeMission } from '@/lib/types';
import { resolveMissionTypeColor, formatMissionDuration } from '@/lib/mission-timeline';
import { formatMissionRequirementLabel } from '@/lib/missions';
import { SkillBadge } from '@/components/skills/skill-badge';
import type { ConflictInfo } from '@/lib/ope-dashboard';
import { Avatar, ConflictMark, EffectifBadge, MaterielChip, StatusBadge, formatTimeRange } from '@/components/ope/atoms';

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
      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
          {mission.type.name ?? 'Événement'}
        </span>
        <StatusBadge status={mission.status} />
      </div>

      <h3 className="mt-1 text-sm font-semibold leading-snug text-slate-900">{mission.title}</h3>

      <dl className="mt-1.5 space-y-0.5 text-xs text-slate-600">
        <div>
          🕒 {formatTimeRange(mission.starts_at, mission.ends_at)}{' '}
          <span className="text-slate-400">({formatMissionDuration(mission.starts_at, mission.ends_at)})</span>
        </div>
        {mission.location ? <div className="truncate">📍 {mission.location}</div> : null}
      </dl>

      {/* Besoins */}
      {mission.requiredSkills.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {mission.requiredSkills.map((rs) => (
            <span
              key={rs.id}
              className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
            >
              {formatMissionRequirementLabel(rs.skill?.name, rs.quantity)}
            </span>
          ))}
        </div>
      ) : null}

      {/* Équipe engagée (toujours visible) */}
      <div className="mt-2 border-t border-slate-100 pt-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Engagés</span>
          <EffectifBadge engaged={mission.team.length} required={mission.required_volunteers} />
        </div>
        {mission.team.length === 0 ? (
          <p className="text-[11px] italic text-slate-400">Aucun secouriste engagé</p>
        ) : (
          <ul className="space-y-1.5">
            {mission.team.map((member) => {
              const conflict = conflicts.get(member.volunteer_id);
              return (
                <li key={member.volunteer_id} className="flex items-center gap-1.5">
                  <Avatar name={member.full_name} />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">
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
        <div className="mt-2 border-t border-slate-100 pt-2">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Matériel engagé
          </div>
          <div className="flex flex-wrap gap-1">
            {mission.materiel.map((item) => (
              <MaterielChip
                key={item.container_type_id}
                name={item.name}
                code={item.code}
                color={item.category?.color ?? null}
              />
            ))}
          </div>
        </div>
      ) : null}
    </button>
  );
}
