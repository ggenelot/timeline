'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import type { OpeDashboardData, OpeMission, RoleBehavior } from '@/lib/types';
import { buildDayAxis, missionDayKey } from '@/lib/mission-timeline';
import {
  buildMaterielSlots,
  buildRoleSlots,
  isVolunteerEligibleForMission,
  materielPoolByDay,
  volunteerPoolByDay,
  type BoardPickerTarget,
  type BoardSelection,
  type BoardVolunteerCandidate,
  type ContainerDragPayload,
  type VolunteerDragPayload,
} from '@/lib/mission-board';
import {
  assignMaterielToMission,
  assignVolunteerToMission,
  unassignMaterielFromMission,
  unassignVolunteerFromMission,
  type MissionBoardActionResult,
} from '@/lib/queries/mission-board';
import { TypeFilter, type OpeTypeOption } from '@/components/ope/type-filter';
import { VolunteerPoolColumn, MaterielPoolColumn } from '@/components/ope/board/pool-columns';
import { BoardMissionCard } from '@/components/ope/board/board-mission-card';
import { SelectionBanner } from '@/components/ope/board/selection-banner';
import { AssignmentPickerModal } from '@/components/ope/board/assignment-picker-modal';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

const DEFAULT_VISIBLE_DAYS = 13; // 3 jours passés + aujourd'hui + 9 jours à venir
const MAX_VISIBLE_DAYS = 60;
const EXTEND_STEP = 10;
const COLUMN_WIDTH = 272;

function startOfTodayMinus(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

const TODAY_KEY = missionDayKey(new Date().toISOString());

export default function MissionBoardPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [data, setData] = useState<OpeDashboardData | null>(null);

  const [visibleDays, setVisibleDays] = useState(DEFAULT_VISIBLE_DAYS);
  const [disabledTypes, setDisabledTypes] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<BoardSelection | null>(null);
  const [picker, setPicker] = useState<BoardPickerTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const fromISO = useMemo(() => startOfTodayMinus(3).toISOString(), []);
  const canEditMateriel = role === 'admin';

  // Accès (une fois).
  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace('/login');
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const tok = sessionData.session?.access_token ?? '';
      setToken(tok);

      const { data: profileData } = await supabase.from('profiles').select('role').eq('id', authData.user.id).single();
      setRole(profileData?.role ?? null);

      let ok = profileData?.role === 'admin' || profileData?.role === 'responsable';
      if (!ok) {
        const res = await fetch('/api/roles/mine', { headers: { Authorization: `Bearer ${tok}` } });
        if (res.ok) {
          const { behaviors } = (await res.json()) as { behaviors: RoleBehavior[] };
          ok = behaviors.some((b) => b.resource_type === 'mission' && b.behavior_type === 'can_manage');
        }
      }
      setAllowed(ok);
      if (!ok) setLoading(false);
    }
    void init();
  }, [router]);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    const res = await fetch(`/api/admin/ope-dashboard?from=${encodeURIComponent(fromISO)}&days=${visibleDays}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? 'Erreur lors du chargement.');
      return;
    }
    setData((await res.json()) as OpeDashboardData);
  }, [token, fromISO, visibleDays]);

  useEffect(() => {
    if (!allowed || !token) return;
    let cancelled = false;
    setLoading(true);
    void load().then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [allowed, token, load]);

  const allMissions = useMemo(() => data?.missions ?? [], [data]);
  const availability = useMemo(() => data?.availability ?? [], [data]);

  const typeOptions = useMemo<OpeTypeOption[]>(() => {
    const seen = new Map<string, OpeTypeOption>();
    for (const m of allMissions) {
      const name = m.type.name;
      if (name && !seen.has(name)) seen.set(name, { name, color: m.type.color });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allMissions]);

  const filteredMissions = useMemo(
    () => allMissions.filter((m) => !(m.type.name && disabledTypes.has(m.type.name))),
    [allMissions, disabledTypes]
  );

  const missionsByDay = useMemo(() => {
    const map = new Map<string, OpeMission[]>();
    for (const m of filteredMissions) {
      const key = missionDayKey(m.starts_at);
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return map;
  }, [filteredMissions]);

  const volunteerPool = useMemo(() => volunteerPoolByDay(allMissions, availability), [allMissions, availability]);
  const materielPool = useMemo(() => materielPoolByDay(allMissions, data?.containers ?? []), [allMissions, data]);
  const dayAxis = useMemo(() => buildDayAxis(fromISO, visibleDays), [fromISO, visibleDays]);

  function toggleType(name: string) {
    setDisabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleExpand(missionId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(missionId)) next.delete(missionId);
      else next.add(missionId);
      return next;
    });
  }

  function resetView() {
    setDisabledTypes(new Set());
    setExpanded(new Set());
    setSelected(null);
    setPicker(null);
    setVisibleDays(DEFAULT_VISIBLE_DAYS);
  }

  async function runAction(action: () => Promise<MissionBoardActionResult>) {
    setBusy(true);
    setActionError(null);
    const result = await action();
    if (!result.ok) {
      setActionError(result.error);
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  }

  // ── Bénévoles ──────────────────────────────────────────────────────
  function selectVolunteer(candidate: BoardVolunteerCandidate) {
    setSelected((cur) =>
      cur?.kind === 'volunteer' && cur.volunteerId === candidate.volunteer_id && !cur.fromAssignmentId
        ? null
        : { kind: 'volunteer', volunteerId: candidate.volunteer_id, label: candidate.full_name ?? 'Bénévole' }
    );
  }

  function selectVolunteerSlot(payload: { volunteerId: string; fromAssignmentId?: string; label: string }) {
    setSelected((cur) =>
      cur?.kind === 'volunteer' && cur.volunteerId === payload.volunteerId && cur.fromAssignmentId === payload.fromAssignmentId
        ? null
        : { kind: 'volunteer', ...payload }
    );
  }

  function placeVolunteer(missionId: string, requiredSkillId: string, volunteerId: string, fromAssignmentId?: string) {
    if (!isVolunteerEligibleForMission(volunteerId, missionId, availability)) {
      setActionError("Ce bénévole n'a pas de disponibilité déclarée pour cette mission.");
      return;
    }
    void runAction(() => assignVolunteerToMission({ missionId, volunteerId, requiredSkillId, fromAssignmentId }));
  }

  function handleClickEmptyVolunteerSlot(missionId: string, requiredSkillId: string, skillId: string | null, roleName: string) {
    if (selected?.kind === 'volunteer') {
      placeVolunteer(missionId, requiredSkillId, selected.volunteerId, selected.fromAssignmentId);
      setSelected(null);
      return;
    }
    setPicker({ kind: 'volunteer', missionId, requiredSkillId, skillId, roleName });
  }

  function handleDropVolunteerSlot(missionId: string, requiredSkillId: string, payload: VolunteerDragPayload) {
    placeVolunteer(missionId, requiredSkillId, payload.volunteerId, payload.fromAssignmentId);
  }

  function handleVolunteerPoolDrop(payload: VolunteerDragPayload | ContainerDragPayload) {
    if (payload.kind !== 'volunteer' || !payload.fromAssignmentId) return;
    void runAction(() => unassignVolunteerFromMission(payload.fromAssignmentId!));
  }

  function handleRemoveVolunteer(assignmentId: string) {
    void runAction(() => unassignVolunteerFromMission(assignmentId));
  }

  function handlePickVolunteer(volunteerId: string, fromAssignmentId?: string) {
    if (!picker || picker.kind !== 'volunteer') return;
    const { missionId, requiredSkillId } = picker;
    setPicker(null);
    placeVolunteer(missionId, requiredSkillId, volunteerId, fromAssignmentId);
  }

  // ── Matériel ───────────────────────────────────────────────────────
  function selectContainer(container: { id: string; name: string; code: string | null }) {
    setSelected((cur) =>
      cur?.kind === 'container' && cur.containerId === container.id && !cur.fromAssignmentId
        ? null
        : { kind: 'container', containerId: container.id, label: container.code ? `${container.name} · ${container.code}` : container.name }
    );
  }

  function selectContainerSlot(payload: { containerId: string; fromAssignmentId?: string; label: string }) {
    setSelected((cur) =>
      cur?.kind === 'container' && cur.containerId === payload.containerId && cur.fromAssignmentId === payload.fromAssignmentId
        ? null
        : { kind: 'container', ...payload }
    );
  }

  function placeContainer(requirementId: string, containerId: string, fromAssignmentId?: string) {
    void runAction(() => assignMaterielToMission({ requirementId, containerId, fromAssignmentId }));
  }

  function handleClickEmptyContainerSlot(missionId: string, requirementId: string, categoryId: string | null, categoryName: string) {
    if (!canEditMateriel) return;
    if (selected?.kind === 'container') {
      placeContainer(requirementId, selected.containerId, selected.fromAssignmentId);
      setSelected(null);
      return;
    }
    setPicker({ kind: 'container', missionId, requirementId, categoryId, categoryName });
  }

  function handleDropContainerSlot(requirementId: string, payload: ContainerDragPayload) {
    placeContainer(requirementId, payload.containerId, payload.fromAssignmentId);
  }

  function handleContainerPoolDrop(payload: VolunteerDragPayload | ContainerDragPayload) {
    if (payload.kind !== 'container' || !payload.fromAssignmentId) return;
    void runAction(() => unassignMaterielFromMission(payload.fromAssignmentId!));
  }

  function handleRemoveContainer(assignmentId: string) {
    void runAction(() => unassignMaterielFromMission(assignmentId));
  }

  function handlePickContainer(containerId: string, fromAssignmentId?: string) {
    if (!picker || picker.kind !== 'container') return;
    const { requirementId } = picker;
    setPicker(null);
    placeContainer(requirementId, containerId, fromAssignmentId);
  }

  if (allowed === false) {
    return (
      <div className="rounded-[15px] border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
        Accès refusé : page réservée au pilotage opérationnel (admin, responsable ou gestionnaire de missions).
      </div>
    );
  }

  return (
    <div className="mx-[calc(50%_-_50vw)] w-screen overflow-x-clip px-3 sm:px-6 lg:ml-[calc(50%_-_50vw_+_125px)] lg:mr-0 lg:w-[calc(100vw_-_250px)] lg:px-10">
      <div className="mb-1.5 text-xs font-bold text-ink-4">
        OPE <span className="text-[#CBD2DE]">›</span> <span className="text-ink-3">Tableau de gestion des missions</span>
      </div>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-black tracking-[-0.02em] text-ink">Tableau de gestion des missions</h1>
          <p className="mt-0.5 hidden text-sm text-ink-2 sm:block">
            Composez les équipages et le matériel — glissez ou touchez un élément disponible puis un emplacement.
          </p>
        </div>
        <button
          type="button"
          onClick={resetView}
          title="Réinitialiser l'affichage (filtres, cartes dépliées, période)"
          className="flex shrink-0 items-center gap-1.5 rounded-[10px] border border-line-field bg-surface-card px-3.5 py-2 text-[13px] font-bold text-ink-2 transition hover:bg-surface-sub"
        >
          <Icon name="restart_alt" size={17} />
          <span className="hidden sm:inline">Réinitialiser l&apos;affichage</span>
        </button>
      </div>

      {typeOptions.length > 0 ? (
        <div className="mb-4">
          <TypeFilter types={typeOptions} disabled={disabledTypes} onToggle={toggleType} />
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-[10px] border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">{error}</div>
      ) : null}
      {actionError ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-[10px] border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} aria-label="Fermer" className="shrink-0 text-bad/70 hover:text-bad">
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-64 w-[272px] shrink-0 animate-pulse rounded-[15px] border border-line bg-surface-sub" />
          ))}
        </div>
      ) : (
        <div className={cn('overflow-x-auto pb-2', busy && 'pointer-events-none opacity-70')}>
          <div style={{ minWidth: 'min-content' }}>
            {/* Ligne unique des jours */}
            <div className="mb-3 flex gap-3">
              {dayAxis.map((day) => (
                <div key={day.key} style={{ width: COLUMN_WIDTH }} className="shrink-0">
                  {day.key === TODAY_KEY ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-[3px] text-[12px] font-bold capitalize text-white">
                      {day.label}
                    </span>
                  ) : (
                    <span className="text-[13.5px] font-bold capitalize text-ink">{day.label}</span>
                  )}
                </div>
              ))}
              {visibleDays < MAX_VISIBLE_DAYS ? (
                <button
                  type="button"
                  onClick={() => setVisibleDays((d) => Math.min(d + EXTEND_STEP, MAX_VISIBLE_DAYS))}
                  style={{ width: COLUMN_WIDTH }}
                  className="h-[30px] shrink-0 rounded-[10px] border-[1.5px] border-dashed border-line-field bg-surface-card text-[12.5px] font-bold text-ink-2 hover:bg-surface-sub"
                >
                  +{EXTEND_STEP} jours →
                </button>
              ) : null}
            </div>

            {/* Bénévoles disponibles */}
            <div className="sticky left-0 mb-2 w-fit">
              <h2 className="text-[15px] font-extrabold text-ink">Bénévoles disponibles</h2>
            </div>
            <div className="mb-[22px] flex gap-3">
              {dayAxis.map((day) => (
                <div key={day.key} style={{ width: COLUMN_WIDTH }} className="flex shrink-0 flex-col">
                  <VolunteerPoolColumn
                    candidates={volunteerPool.get(day.key) ?? []}
                    selected={selected}
                    onSelect={selectVolunteer}
                    onDropReturn={handleVolunteerPoolDrop}
                  />
                </div>
              ))}
            </div>

            {/* Matériel disponible */}
            <div className="sticky left-0 mb-2 w-fit">
              <h2 className="text-[15px] font-extrabold text-ink">Matériel disponible</h2>
            </div>
            <div className="mb-[26px] flex gap-3">
              {dayAxis.map((day) => {
                const pool = materielPool.get(day.key) ?? { available: [], unavailable: [] };
                return (
                  <div key={day.key} style={{ width: COLUMN_WIDTH }} className="flex shrink-0 flex-col">
                    <MaterielPoolColumn
                      available={pool.available}
                      unavailable={pool.unavailable}
                      selected={selected}
                      canEdit={canEditMateriel}
                      onSelect={selectContainer}
                      onDropReturn={handleContainerPoolDrop}
                    />
                  </div>
                );
              })}
            </div>

            {/* Missions */}
            <div className="sticky left-0 mb-2 w-fit">
              <h2 className="text-[15px] font-extrabold text-ink">Missions</h2>
            </div>
            <div className="flex items-start gap-3">
              {dayAxis.map((day) => {
                const missions = missionsByDay.get(day.key) ?? [];
                return (
                  <div key={day.key} style={{ width: COLUMN_WIDTH }} className="flex shrink-0 flex-col gap-[10px]">
                    {missions.length === 0 ? (
                      <div className="flex h-[70px] items-center justify-center rounded-[16px] border-[1.5px] border-dashed border-[#DDE3EC] text-[12px] font-semibold text-ink-4">
                        Rien de prévu
                      </div>
                    ) : (
                      missions.map((mission) => (
                        <BoardMissionCard
                          key={mission.id}
                          mission={mission}
                          roles={buildRoleSlots(mission)}
                          materiels={buildMaterielSlots(mission)}
                          isExpanded={expanded.has(mission.id)}
                          onToggleExpand={() => toggleExpand(mission.id)}
                          selected={selected}
                          canEditMateriel={canEditMateriel}
                          onSelectVolunteer={selectVolunteerSlot}
                          onSelectContainer={selectContainerSlot}
                          onDropVolunteerSlot={(requiredSkillId, payload) => handleDropVolunteerSlot(mission.id, requiredSkillId, payload)}
                          onDropContainerSlot={handleDropContainerSlot}
                          onClickEmptyVolunteerSlot={(requiredSkillId, skillId, roleName) =>
                            handleClickEmptyVolunteerSlot(mission.id, requiredSkillId, skillId, roleName)
                          }
                          onClickEmptyContainerSlot={(requirementId, categoryId, categoryName) =>
                            handleClickEmptyContainerSlot(mission.id, requirementId, categoryId, categoryName)
                          }
                          onRemoveVolunteer={handleRemoveVolunteer}
                          onRemoveContainer={handleRemoveContainer}
                        />
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {selected ? <SelectionBanner selection={selected} onClear={() => setSelected(null)} /> : null}

      {picker ? (
        <AssignmentPickerModal
          target={picker}
          missions={allMissions}
          availability={availability}
          volunteerPool={volunteerPool}
          materielPool={materielPool}
          onClose={() => setPicker(null)}
          onPickVolunteer={handlePickVolunteer}
          onPickContainer={handlePickContainer}
        />
      ) : null}
    </div>
  );
}
