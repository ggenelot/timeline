'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { OpeAvailabilityEntry, OpeMission } from '@/lib/types';
import { resolveMissionTypeColor, formatMissionDuration } from '@/lib/mission-timeline';
import { formatMissionRequirementLabel } from '@/lib/missions';
import { SkillBadge } from '@/components/skills/skill-badge';
import { Avatar, MaterielChip, StatusBadge, formatTimeRange } from '@/components/ope/atoms';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

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
    <Modal
      onClose={onClose}
      accentColor={accent}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Link
            href={`/missions/${mission.id}`}
            className="text-[13.5px] font-semibold text-accent-text hover:underline"
          >
            Ouvrir la fiche complète →
          </Link>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Fermer
            </Button>
            <Link href={`/missions/${mission.id}`}>
              <Button variant="primary">Gérer l&apos;équipe</Button>
            </Link>
          </div>
        </div>
      }
    >
      {/* En-tête riche (type, titre, statut, méta) */}
      <div className="flex items-start justify-between gap-3 pt-1">
        <div>
          <span className="text-[11px] font-extrabold uppercase tracking-[0.05em]" style={{ color: accent }}>
            {mission.type.name ?? 'Événement'}
          </span>
          <h2 className="mt-0.5 text-[19px] font-extrabold text-ink">{mission.title}</h2>
        </div>
        <StatusBadge status={mission.status} />
      </div>
      <dl className="mt-2.5 flex flex-col gap-[3px] text-[13.5px] text-ink-2">
        <div className="flex items-center gap-2 capitalize">
          <Icon name="calendar_today" size={17} className="text-ink-3" />
          {dateLabel}
        </div>
        <div className="flex items-center gap-2">
          <Icon name="schedule" size={17} className="text-ink-3" />
          <span>
            {formatTimeRange(mission.starts_at, mission.ends_at)}{' '}
            <span className="text-ink-3">({formatMissionDuration(mission.starts_at, mission.ends_at)})</span>
          </span>
        </div>
        {mission.location ? (
          <div className="flex items-center gap-2">
            <Icon name="location_on" size={17} className="text-ink-3" />
            {mission.location}
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-col gap-4 border-t border-line-row pt-4">
        {mission.description ? (
          <p className="whitespace-pre-wrap text-[13.5px] leading-[1.55] text-ink-2">{mission.description}</p>
        ) : null}

        {/* Besoins */}
        {mission.requiredSkills.length > 0 ? (
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">Besoins</h3>
            <div className="flex flex-wrap gap-1.5">
              {mission.requiredSkills.map((rs) => (
                <span
                  key={rs.id}
                  className="inline-flex rounded-full border border-line-field bg-surface-sub px-2.5 py-[3px] text-[12px] font-semibold text-ink-2"
                >
                  {formatMissionRequirementLabel(rs.skill?.name, rs.quantity)}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {/* Équipe engagée */}
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">
            Secouristes engagés ({mission.team.length}/{mission.required_volunteers || '—'})
          </h3>
          {mission.team.length === 0 ? (
            <p className="text-[13.5px] italic text-ink-3">Aucun secouriste engagé</p>
          ) : (
            <ul className="flex flex-col gap-[11px]">
              {mission.team.map((member) => (
                <li key={member.volunteer_id} className="flex items-start gap-2.5">
                  <Avatar name={member.full_name} avatarUrl={member.avatar_url} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-semibold text-ink-2">{member.full_name ?? 'Bénévole'}</span>
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
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">
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
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">
              Dispo non retenus ({notRetained.length})
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {notRetained.map((entry) => (
                <li
                  key={entry.volunteer_id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-sub py-0.5 pl-0.5 pr-2.5"
                >
                  <Avatar name={entry.full_name} avatarUrl={entry.avatar_url} />
                  <span className="text-[12px] text-ink-2">{entry.full_name ?? 'Bénévole'}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
