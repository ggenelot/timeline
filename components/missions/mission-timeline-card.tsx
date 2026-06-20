'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Mission, MissionProposalResponse, MissionRequiredSkill, MissionStatus } from '@/lib/types';
import { formatMissionDuration, MissionRelation } from '@/lib/mission-timeline';
import { getMissionStatusBadgeClass, MISSION_STATUS_LABELS } from '@/lib/missions';

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

  const ghostButtonClass =
    'rounded-[9px] border border-[#e2e8f0] bg-white px-[13px] py-[7px] text-[13px] font-semibold text-[#64748b] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
  const primaryButtonClass =
    'rounded-[9px] bg-[#059669] px-[18px] py-2 text-[13px] font-bold text-white hover:bg-[#047857] disabled:cursor-not-allowed disabled:opacity-50';

  const status: MissionStatus = mission.status;

  return (
    <article
      className="rounded-2xl border border-[#e7e9ee] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-opacity"
      style={{ opacity: isUnavailable ? 0.66 : 1 }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-[18px] pb-3 pt-4 text-left"
      >
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: typeColor }}>
            {missionTypeName ?? '—'}
          </div>
          <h3 className="mt-0.5 text-[16px] font-[650] leading-[1.3] text-[#0f172a]">{mission.title}</h3>
          <div className="mt-1 text-[13px] text-[#64748b]">
            {dayLabel} · {mission.location?.trim() || 'Lieu non défini'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[13px] font-semibold tabular-nums text-[#334155]">{timeRange}</div>
          <div className="text-[12px] text-[#94a3b8]">{duration}</div>
        </div>
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] pb-[14px]">
        <div className="inline-flex items-center gap-[7px] text-[13px] font-semibold">
          {requiredSkills.length === 0 ? (
            <>
              <span className="h-[6px] w-[6px] rounded-full bg-[#cbd5e1]" />
              <span className="text-[#64748b]">Ouvert à tous</span>
            </>
          ) : missingCount > 0 ? (
            <>
              <span className="h-[6px] w-[6px] rounded-full bg-[#f59e0b]" />
              <span className="text-[#b45309]">
                Manque {missingCount} bénévole{missingCount > 1 ? 's' : ''}
              </span>
            </>
          ) : (
            <>
              <span className="h-[6px] w-[6px] rounded-full bg-[#10b981]" />
              <span className="text-[#047857]">Équipe complète</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isBenevole ? (
            !canPropose ? null : relation === 'retenu' ? (
              <span className="text-[13px] font-bold text-[#047857]">✓ Retenu sur cette mission</span>
            ) : relation === 'engaged' ? (
              <>
                <span className="text-[13px]">
                  <span className="font-bold text-[#047857]">✓ Engagé</span>
                  <span className="text-[#64748b]"> · en attente de sélection</span>
                </span>
                <button type="button" disabled={pendingAction !== null} onClick={() => respond('unavailable')} className={ghostButtonClass}>
                  {pendingAction === 'unavailable' ? 'Envoi…' : 'Se désengager'}
                </button>
              </>
            ) : relation === 'declined' ? (
              <>
                <span className="text-[13px] text-[#94a3b8]">Indisponible</span>
                <button
                  type="button"
                  disabled={pendingAction !== null}
                  onClick={() => respond('available')}
                  className="rounded-[9px] border border-[#cbd5e1] bg-white px-[13px] py-[7px] text-[13px] font-semibold text-[#047857] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pendingAction === 'available' ? 'Envoi…' : 'Me rendre disponible'}
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={pendingAction !== null} onClick={() => respond('unavailable')} className={ghostButtonClass}>
                  {pendingAction === 'unavailable' ? 'Envoi…' : 'Non disponible'}
                </button>
                <button type="button" disabled={pendingAction !== null} onClick={() => respond('available')} className={primaryButtonClass}>
                  {pendingAction === 'available' ? 'Envoi…' : "S'engager"}
                </button>
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
                    <button
                      type="button"
                      onClick={() => void onPublishDraft(mission.id)}
                      className="rounded-[9px] border border-emerald-300 bg-emerald-50 px-[13px] py-[7px] text-[13px] font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      Passer en proposé
                    </button>
                  ) : null}
                  <Link
                    href={`/missions/${mission.id}`}
                    className="rounded-[9px] border border-[#e2e8f0] bg-white px-[13px] py-[7px] text-[13px] font-semibold text-[#334155] hover:bg-slate-50"
                  >
                    Gérer
                  </Link>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>

      {error ? <div className="px-[18px] pb-3 text-[12px] text-red-600">{error}</div> : null}

      {expanded ? (
        <div className="border-t border-[#eef1f5] bg-[#fafbfc] px-[18px] py-[15px]">
          {mission.description?.trim() ? (
            <p className="text-[13px] leading-[1.55] text-[#475569]">{mission.description}</p>
          ) : null}

          {skillCoverage.length > 0 ? (
            <div className="mt-3">
              <div className="text-[12px] font-bold text-[#475569]">Compétences requises</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {skillCoverage.map((skill) => {
                  const met = skill.have >= skill.need;
                  return (
                    <span
                      key={skill.name}
                      className={`rounded-[7px] border px-2 py-0.5 text-[12px] font-medium ${
                        met
                          ? 'border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]'
                          : 'border-[#fde68a] bg-[#fffbeb] text-[#b45309]'
                      }`}
                    >
                      {skill.name} {skill.have}/{skill.need}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-3">
            <div className="text-[12px] font-bold text-[#475569]">
              {isBenevole ? 'Déjà engagés' : 'Disponibles'} · {availableVolunteers.length}
            </div>
            {availableVolunteers.length > 0 ? (
              <p className="mt-1 text-[13px] text-[#64748b]">{availableVolunteers.map((volunteer) => volunteer.name).join(', ')}</p>
            ) : (
              <p className="mt-1 text-[13px] text-[#94a3b8]">Personne pour l’instant.</p>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}
