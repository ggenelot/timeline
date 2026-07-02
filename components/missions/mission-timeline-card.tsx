'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Mission, MissionProposalResponse, MissionRequiredSkill, MissionStatus } from '@/lib/types';
import { formatMissionDuration, MissionRelation } from '@/lib/mission-timeline';
import { getMissionStatusBadgeClass, MISSION_STATUS_LABELS } from '@/lib/missions';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

type Volunteer = { name: string; skills: Array<{ name: string; color?: string | null }> };

type MissionTimelineCardProps = {
  mission: Mission;
  missionTypeName?: string;
  typeColor: string;
  requiredSkills: MissionRequiredSkill[];
  availableVolunteers: Volunteer[];
  expanded: boolean;
  onToggle: () => void;
  variant: 'benevole' | 'admin';
  // Bénévole
  relation?: MissionRelation;
  canPropose?: boolean;
  onResponse?: () => void;
  // Admin
  canEdit?: boolean;
  onPublishDraft?: (missionId: string) => Promise<void>;
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function MissionTimelineCard({
  mission,
  missionTypeName,
  typeColor,
  requiredSkills,
  availableVolunteers,
  expanded,
  onToggle,
  variant,
  relation = 'pending',
  canPropose = false,
  onResponse,
  canEdit = false,
  onPublishDraft
}: MissionTimelineCardProps) {
  const [pendingAction, setPendingAction] = useState<MissionProposalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isBenevole = variant === 'benevole';
  const isUnavailable = isBenevole && relation === 'declined';

  const skillCoverage = useMemo(
    () =>
      requiredSkills
        .map((requiredSkill) => requiredSkill.skill?.name?.trim())
        .filter((skillName): skillName is string => Boolean(skillName))
        .map((skillName) => {
          const requirement = requiredSkills.find((item) => item.skill?.name?.trim() === skillName);
          const have = availableVolunteers.filter((volunteer) => volunteer.skills.some((skill) => skill.name === skillName)).length;
          return { name: skillName, have, need: requirement?.quantity ?? 0 };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })),
    [requiredSkills, availableVolunteers]
  );

  const missingCount = useMemo(
    () => skillCoverage.reduce((total, skill) => total + Math.max(0, skill.need - skill.have), 0),
    [skillCoverage]
  );

  const start = new Date(mission.starts_at);
  const end = new Date(mission.ends_at);

  const dayLabel = capitalize(start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
  const timeRange = `${start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
  const duration = formatMissionDuration(mission.starts_at, mission.ends_at);

  async function respond(response: MissionProposalResponse) {
    setPendingAction(response);
    setError(null);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      setError('Session invalide. Reconnectez-vous pour répondre.');
      setPendingAction(null);
      return;
    }

    const { data: existing } = await supabase
      .from('mission_proposals')
      .select('id')
      .eq('mission_id', mission.id)
      .eq('volunteer_id', user.id)
      .limit(1);

    const existingRow = existing?.[0] ?? null;

    const basePayload = {
      response,
      status: 'pending' as const,
      updated_by_admin: false,
      updated_by: null,
      source: 'volunteer' as const,
      updated_at: new Date().toISOString()
    };

    const { error: writeError } = existingRow
      ? await supabase.from('mission_proposals').update(basePayload).eq('id', existingRow.id)
      : await supabase.from('mission_proposals').insert({
          mission_id: mission.id,
          volunteer_id: user.id,
          proposed_by: user.id,
          ...basePayload
        });

    setPendingAction(null);

    if (writeError) {
      setError(writeError.message);
      return;
    }

    onResponse?.();
  }

  const status: MissionStatus = mission.status;

  return (
    <article
      className="overflow-hidden rounded-2xl border border-line bg-surface-card shadow-card transition hover:-translate-y-px hover:shadow-lift"
      style={{ opacity: isUnavailable ? 0.66 : 1 }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-[18px] pb-3 pt-4 text-left"
      >
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: typeColor }}>
            {missionTypeName ?? '—'}
          </div>
          <h3 className="mt-0.5 text-[16px] font-bold leading-[1.3] text-ink">{mission.title}</h3>
          <div className="mt-1 text-[13px] text-ink-2">
            {dayLabel} · {mission.location?.trim() || 'Lieu non défini'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[13px] font-bold tabular-nums text-ink-2">{timeRange}</div>
          <div className="text-[12px] text-ink-3">{duration}</div>
        </div>
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] pb-[14px]">
        <div className="inline-flex items-center gap-[7px] text-[13px] font-bold">
          {requiredSkills.length === 0 ? (
            <>
              <span className="h-[7px] w-[7px] rounded-full bg-ink-4" />
              <span className="text-ink-3">Ouvert à tous</span>
            </>
          ) : missingCount > 0 ? (
            <>
              <span className="h-[7px] w-[7px] rounded-full bg-warn-bar" />
              <span className="text-warn-text">
                Manque {missingCount} bénévole{missingCount > 1 ? 's' : ''}
              </span>
            </>
          ) : (
            <>
              <span className="h-[7px] w-[7px] rounded-full bg-ok-bar" />
              <span className="text-ok-text">Équipe complète</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isBenevole ? (
            !canPropose ? null : relation === 'retenu' ? (
              <span className="inline-flex items-center gap-1 text-[13px] font-bold text-ok-text">
                <Icon name="check" size={16} />Retenu sur cette mission
              </span>
            ) : relation === 'engaged' ? (
              <>
                <span className="text-[13px]">
                  <span className="inline-flex items-center gap-1 font-bold text-ok-text">
                    <Icon name="check" size={15} />Engagé
                  </span>
                  <span className="text-ink-2"> · en attente de sélection</span>
                </span>
                <Button variant="ghost" disabled={pendingAction !== null} onClick={() => respond('unavailable')}>
                  {pendingAction === 'unavailable' ? 'Envoi…' : 'Se désengager'}
                </Button>
              </>
            ) : relation === 'declined' ? (
              <>
                <span className="text-[13px] text-ink-3">Indisponible</span>
                <Button variant="ghost" className="text-ok-text" disabled={pendingAction !== null} onClick={() => respond('available')}>
                  {pendingAction === 'available' ? 'Envoi…' : 'Me rendre disponible'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" disabled={pendingAction !== null} onClick={() => respond('unavailable')}>
                  {pendingAction === 'unavailable' ? 'Envoi…' : 'Non disponible'}
                </Button>
                <Button variant="engage" icon="add_task" disabled={pendingAction !== null} onClick={() => respond('available')}>
                  {pendingAction === 'available' ? 'Envoi…' : "S'engager"}
                </Button>
              </>
            )
          ) : (
            <>
              <span className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${getMissionStatusBadgeClass(status)}`}>
                {MISSION_STATUS_LABELS[status]}
              </span>
              {canEdit ? (
                <>
                  {status === 'draft' && onPublishDraft ? (
                    <Button variant="engage" onClick={() => void onPublishDraft(mission.id)}>
                      Passer en proposé
                    </Button>
                  ) : null}
                  <Link
                    href={`/missions/${mission.id}`}
                    className={cn(
                      'inline-flex items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] border-line-field bg-surface-card px-4 py-2 text-sm font-bold text-ink-2 transition hover:bg-[#F4F6FB]'
                    )}
                  >
                    Gérer
                  </Link>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>

      {error ? <div className="px-[18px] pb-3 text-[12px] text-bad">{error}</div> : null}

      {expanded ? (
        <div className="border-t border-line-row bg-surface-sub px-[18px] py-[15px]">
          {mission.description?.trim() ? (
            <p className="text-[13px] leading-[1.55] text-ink-2">{mission.description}</p>
          ) : null}

          {skillCoverage.length > 0 ? (
            <div className="mt-3">
              <div className="text-[12px] font-bold text-ink-2">Compétences requises</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {skillCoverage.map((skill) => {
                  const met = skill.have >= skill.need;
                  return (
                    <span
                      key={skill.name}
                      className={cn(
                        'rounded-[7px] border px-2 py-0.5 text-[12px] font-semibold',
                        met ? 'border-ok-line bg-ok-soft text-ok-text' : 'border-warn-line bg-warn-soft text-warn-text'
                      )}
                    >
                      {skill.name} {skill.have}/{skill.need}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-3">
            <div className="text-[12px] font-bold text-ink-2">
              {isBenevole ? 'Déjà engagés' : 'Disponibles'} · {availableVolunteers.length}
            </div>
            {availableVolunteers.length > 0 ? (
              <p className="mt-1 text-[13px] text-ink-2">{availableVolunteers.map((volunteer) => volunteer.name).join(', ')}</p>
            ) : (
              <p className="mt-1 text-[13px] text-ink-3">Personne pour l’instant.</p>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}
