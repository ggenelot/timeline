'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { OpeAvailabilityEntry, OpeMission } from '@/lib/types';
import { resolveMissionTypeColor, formatMissionDuration } from '@/lib/mission-timeline';
import { formatMissionRequirementLabel } from '@/lib/missions';
import { SkillBadge } from '@/components/skills/skill-badge';
import { Avatar, MaterielChip, StatusBadge, formatTimeRange } from '@/components/ope/atoms';

export function EventDetailModal({
  mission,
  availability,
  onClose,
}: {
  mission: OpeMission;
  availability: OpeAvailabilityEntry[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const accent = resolveMissionTypeColor(mission.type.name, mission.type.color);
  const teamIds = new Set(mission.team.map((m) => m.volunteer_id));
  const notRetained = availability.filter((a) => a.mission_id === mission.id && !teamIds.has(a.volunteer_id));
  const dateLabel = new Date(mission.starts_at).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={mission.title}
      >
        {/* En-tête */}
        <div className="rounded-t-xl px-5 py-4" style={{ borderTop: `4px solid ${accent}` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
                {mission.type.name ?? 'Événement'}
              </span>
              <h2 className="mt-0.5 text-lg font-bold text-slate-900">{mission.title}</h2>
            </div>
            <StatusBadge status={mission.status} />
          </div>
          <dl className="mt-2 space-y-0.5 text-sm text-slate-600">
            <div className="capitalize">📅 {dateLabel}</div>
            <div>
              🕒 {formatTimeRange(mission.starts_at, mission.ends_at)}{' '}
              <span className="text-slate-400">({formatMissionDuration(mission.starts_at, mission.ends_at)})</span>
            </div>
            {mission.location ? <div>📍 {mission.location}</div> : null}
          </dl>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto border-t border-slate-100 px-5 py-4">
          {mission.description ? (
            <p className="whitespace-pre-wrap text-sm text-slate-700">{mission.description}</p>
          ) : null}

          {/* Besoins */}
          {mission.requiredSkills.length > 0 ? (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Besoins</h3>
              <div className="flex flex-wrap gap-1">
                {mission.requiredSkills.map((rs) => (
                  <span
                    key={rs.id}
                    className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {formatMissionRequirementLabel(rs.skill?.name, rs.quantity)}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {/* Équipe engagée */}
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Secouristes engagés ({mission.team.length}/{mission.required_volunteers || '—'})
            </h3>
            {mission.team.length === 0 ? (
              <p className="text-sm italic text-slate-400">Aucun secouriste engagé</p>
            ) : (
              <ul className="space-y-2">
                {mission.team.map((member) => (
                  <li key={member.volunteer_id} className="flex items-start gap-2">
                    <Avatar name={member.full_name} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-slate-800">{member.full_name ?? 'Bénévole'}</span>
                        {member.assignedSkill ? (
                          <SkillBadge name={member.assignedSkill.name} color={member.assignedSkill.color} />
                        ) : null}
                      </div>
                      {member.validatedSkills.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {member.validatedSkills.map((skill) => (
                            <SkillBadge key={skill.id} name={skill.name} color={skill.color} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Matériel engagé */}
          {mission.materiel.length > 0 ? (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Matériel engagé ({mission.materiel.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {mission.materiel.map((item) => (
                  <MaterielChip key={item.container_type_id} name={item.name} code={item.code} tone="engaged" />
                ))}
              </div>
            </section>
          ) : null}

          {/* Dispo non retenus sur ce poste */}
          {notRetained.length > 0 ? (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Dispo non retenus ({notRetained.length})
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {notRetained.map((entry) => (
                  <li
                    key={entry.volunteer_id}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2"
                  >
                    <Avatar name={entry.full_name} />
                    <span className="text-xs text-slate-600">{entry.full_name ?? 'Bénévole'}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* Pied */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          <Link href={`/missions/${mission.id}`} className="text-sm font-medium text-sky-700 hover:underline">
            Ouvrir la fiche complète →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
