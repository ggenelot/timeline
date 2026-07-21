'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Skill, SkillCategory, MISSION_CATEGORY_LABELS, MISSION_TYPE_OPTIONS, getMissionCategory, MissionStatus } from '@/lib/types';
import { usePermissions } from '@/lib/permissions/permissions-context';
import { SkillBadge, getSkillColorClass } from '@/components/skills/skill-badge';
import { Button } from '@/components/ui/button';
import { initials } from '@/components/ope/atoms';

type CategoryWithSkills = SkillCategory & { skills: Skill[] };

type SponsorRef = { id: string; full_name: string | null; identifier: string | null };

type VolunteerProfile = {
  id: string;
  full_name: string | null;
  identifier: string | null;
  slack_user_id: string | null;
  slack_team_id: string | null;
  slack_username: string | null;
  slack_connected_at: string | null;
  avatar_url: string | null;
  sponsor_id: string | null;
  sponsor: SponsorRef | SponsorRef[] | null;
  profile_skills: Array<{ skill_id: string }> | null;
};

type MissionRef = { starts_at: string | null } | null;

function getMissionStartsAt(mission: MissionRef | MissionRef[]): string | null {
  const m = Array.isArray(mission) ? mission[0] : mission;
  return m?.starts_at ?? null;
}

function formatRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${rate} %`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type StatPeriod = 7 | 30 | 90;

type MissionRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  mission_type_id: string;
  status: MissionStatus;
};

type ProposalWithMission = {
  id: string;
  mission_id: string;
  mission: MissionRow | MissionRow[] | null;
};

type AssignmentRow = {
  mission_id: string;
  assignment_status: string;
};

const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  draft: 'Brouillon',
  proposed: 'Proposée',
  closed: 'Fermée',
  confirmed: 'Confirmée',
  cancelled: 'Annulée',
};

export default function VolunteerProfilePage() {
  const params = useParams<{ id: string }>();
  const volunteerId = params.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { loading: permissionsLoading, can } = usePermissions();
  // Visible pour la supervision (volunteer/can_see) et les gestionnaires de
  // mission (staffing) ; édition réservée à volunteer/can_manage.
  const canViewVolunteer = can('volunteer', 'can_see') || can('mission', 'can_manage');
  const canManageVolunteer = can('volunteer', 'can_manage');

  const [volunteer, setVolunteer] = useState<VolunteerProfile | null>(null);
  const [categories, setCategories] = useState<CategoryWithSkills[]>([]);
  const [selectedSkillByCategory, setSelectedSkillByCategory] = useState<Record<string, string | null>>({});
  const [editingSkills, setEditingSkills] = useState(false);

  const [proposals, setProposals] = useState<Array<{ response: string }>>([]);
  const [confirmedAssignments, setConfirmedAssignments] = useState<Array<{ mission: MissionRef | MissionRef[] }>>([]);
  const [statPeriod, setStatPeriod] = useState<StatPeriod>(30);

  const [godchildren, setGodchildren] = useState<SponsorRef[]>([]);

  const [availableProposals, setAvailableProposals] = useState<ProposalWithMission[]>([]);
  const [confirmedMissionIds, setConfirmedMissionIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  useEffect(() => {
    if (permissionsLoading) return;

    async function loadData() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      if (!canViewVolunteer) {
        setError('Accès refusé : vous n’avez pas la permission de voir les bénévoles.');
        setLoading(false);
        return;
      }

      const [volunteerRes, categoriesRes, proposalsRes, assignmentsRes, availableProposalsRes, godchildrenRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id,full_name,identifier,slack_user_id,slack_team_id,slack_username,slack_connected_at,avatar_url,sponsor_id,sponsor:sponsor_id(id,full_name,identifier),profile_skills(skill_id)')
          .eq('id', volunteerId)
          .single(),
        supabase
          .from('skill_categories')
          .select('id,name,color,display_order,created_at,skills(id,name,display_order,category_id,created_at)')
          .order('display_order', { ascending: true })
          .order('display_order', { referencedTable: 'skills', ascending: true }),
        supabase.from('mission_proposals').select('response').eq('volunteer_id', volunteerId),
        supabase
          .from('mission_assignments')
          .select('mission_id, assignment_status, mission:missions(starts_at)')
          .eq('volunteer_id', volunteerId),
        supabase
          .from('mission_proposals')
          .select('id, mission_id, mission:missions(id, title, starts_at, ends_at, location, mission_type_id, status)')
          .eq('volunteer_id', volunteerId)
          .eq('response', 'available')
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id,full_name,identifier')
          .eq('sponsor_id', volunteerId)
          .order('full_name', { ascending: true }),
      ]);

      if (volunteerRes.error || !volunteerRes.data) {
        setError('Bénévole introuvable.');
        setLoading(false);
        return;
      }

      const vol = volunteerRes.data as VolunteerProfile;
      setVolunteer(vol);

      const cats = (categoriesRes.data ?? []) as CategoryWithSkills[];
      setCategories(cats);

      const selectedSkillIds = new Set((vol.profile_skills ?? []).map((ps) => ps.skill_id));
      const byCategory: Record<string, string | null> = {};
      for (const cat of cats) {
        const match = cat.skills
          .filter((s) => selectedSkillIds.has(s.id))
          .sort((a, b) => b.display_order - a.display_order)[0];
        if (match) byCategory[cat.id] = match.id;
      }
      setSelectedSkillByCategory(byCategory);

      setProposals((proposalsRes.data ?? []) as Array<{ response: string }>);

      const allAssignments = (assignmentsRes.data ?? []) as Array<AssignmentRow & { mission: MissionRef | MissionRef[] }>;
      setConfirmedAssignments(
        allAssignments.filter((a) => a.assignment_status === 'confirmed')
      );
      setConfirmedMissionIds(
        new Set(allAssignments.filter((a) => a.assignment_status === 'confirmed').map((a) => a.mission_id))
      );

      setAvailableProposals((availableProposalsRes.data ?? []) as ProposalWithMission[]);
      setGodchildren((godchildrenRes.data ?? []) as SponsorRef[]);
      setLoading(false);
    }

    if (volunteerId) void loadData();
  }, [router, volunteerId, permissionsLoading, canViewVolunteer]);

  async function saveSkills() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setSaveError('Session invalide.'); setSaving(false); return; }

    const skillIds = Object.values(selectedSkillByCategory).filter((v): v is string => Boolean(v));

    const res = await fetch(`/api/admin/volunteers/${volunteerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        full_name: volunteer?.full_name,
        identifier: volunteer?.identifier,
        skill_ids: skillIds,
      }),
    });

    const result = (await res.json()) as { error?: string };
    if (!res.ok) {
      setSaveError(result.error ?? 'La mise à jour a échoué.');
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditingSkills(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  // Stats
  const total = proposals.length;
  const responded = proposals.filter((p) => p.response !== 'no_response').length;
  const responseRate = total > 0 ? Math.round((responded / total) * 100) : null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - statPeriod);

  const confirmedInPeriod = confirmedAssignments.filter((a) => {
    const startsAt = getMissionStartsAt(a.mission as MissionRef | MissionRef[]);
    return startsAt ? new Date(startsAt) >= cutoff : false;
  }).length;

  // Missions disponibles
  const availableMissions = useMemo<MissionRow[]>(() =>
    availableProposals
      .map((p) => {
        const m = Array.isArray(p.mission) ? p.mission[0] : p.mission;
        return m ?? null;
      })
      .filter((m): m is MissionRow => m !== null),
    [availableProposals]
  );

  const presentTypeIds = useMemo(
    () => new Set(availableMissions.map((m) => m.mission_type_id)),
    [availableMissions]
  );

  const filteredMissions = useMemo(() => {
    const term = searchQuery.trim().toLocaleLowerCase('fr');
    return availableMissions.filter((m) => {
      if (selectedTypeId && m.mission_type_id !== selectedTypeId) return false;
      if (term.length > 0) {
        const haystack = [m.title, m.location ?? ''].join(' ').toLocaleLowerCase('fr');
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [availableMissions, selectedTypeId, searchQuery]);

  if (loading || permissionsLoading) return <p className="text-sm text-ink-2">Chargement...</p>;
  if (error) return <div className="rounded-md border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div>;
  if (!volunteer) return null;

  const sponsor = Array.isArray(volunteer.sponsor) ? volunteer.sponsor[0] ?? null : volunteer.sponsor;

  const currentSkills: Array<Skill & { category?: CategoryWithSkills }> = [];
  for (const [catId, skillId] of Object.entries(selectedSkillByCategory)) {
    if (!skillId) continue;
    const cat = categories.find((c) => c.id === catId);
    const skill = cat?.skills.find((s) => s.id === skillId);
    if (skill && cat) currentSkills.push({ ...skill, category: cat });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-surface-card p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {volunteer.avatar_url ? (
              <img src={volunteer.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#E4E8F0] text-sm font-semibold text-ink-2">
                {initials(volunteer.full_name)}
              </span>
            )}
            <div>
              <Link href="/admin/volunteers" className="mb-1 inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink-2">
                ← Bénévoles
              </Link>
              <h1 className="text-xl font-semibold text-ink">{volunteer.full_name ?? '—'}</h1>
              {volunteer.identifier && (
                <p className="mt-0.5 text-sm text-ink-3">{volunteer.identifier}</p>
              )}
            </div>
          </div>
          {canManageVolunteer && (
            <Link
              href={`/admin/volunteers/${volunteerId}/edit`}
              className="inline-flex items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] border-line-field bg-surface-card px-4 py-2 text-sm font-bold text-ink-2 transition hover:bg-[#F4F6FB]"
            >
              Modifier le compte
            </Link>
          )}
        </div>
      </div>

      {saved && (
        <div className="rounded-md border border-ok-line bg-ok-soft p-3 text-sm text-ok-text">
          Compétences mises à jour.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface-card p-4 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-ink">Informations</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-ink-3">Identifiant</dt>
              <dd className="text-ink">{volunteer.identifier ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-ink-3">Compte Slack</dt>
              <dd>
                {volunteer.slack_user_id && volunteer.slack_team_id ? (
                  <span className="text-ok-text">
                    Connecté{volunteer.slack_username ? ` (@${volunteer.slack_username})` : ''}
                  </span>
                ) : (
                  <span className="text-ink-3">Non connecté</span>
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-ink-3">Parrain</dt>
              <dd className="text-ink">
                {sponsor ? (
                  <Link href={`/admin/volunteers/${sponsor.id}`} className="text-brand hover:underline">
                    {sponsor.full_name?.trim() || sponsor.identifier || sponsor.id}
                  </Link>
                ) : (
                  <span className="text-ink-3">Aucun</span>
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-ink-3">Filleuls</dt>
              <dd className="text-ink">
                {godchildren.length === 0 ? (
                  <span className="text-ink-3">Aucun</span>
                ) : (
                  <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                    {godchildren.map((g, i) => (
                      <span key={g.id}>
                        <Link href={`/admin/volunteers/${g.id}`} className="text-brand hover:underline">
                          {g.full_name?.trim() || g.identifier || g.id}
                        </Link>
                        {i < godchildren.length - 1 ? ',' : ''}
                      </span>
                    ))}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-line bg-surface-card p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Statistiques</h2>
            <div className="flex gap-0.5 rounded border border-line p-0.5">
              {([7, 30, 90] as StatPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setStatPeriod(p)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                    statPeriod === p ? 'bg-brand text-white' : 'text-ink-2 hover:bg-surface-sub'
                  }`}
                >
                  {p}j
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Propositions', value: total },
              { label: 'Taux de réponse', value: formatRate(responseRate) },
              { label: 'Confirmés (tout)', value: confirmedAssignments.length },
              { label: `Confirmés (${statPeriod}j)`, value: confirmedInPeriod },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-surface-sub p-2">
                <p className="text-xs text-ink-3">{label}</p>
                <p className="mt-0.5 font-display text-2xl leading-none text-ink">{value}</p>
              </div>
            ))}
          </div>
          {total > 0 && (
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              {[
                { label: 'Dispo', count: proposals.filter((p) => p.response === 'available').length, color: 'text-ok-text' },
                { label: 'Peut-être', count: proposals.filter((p) => p.response === 'maybe').length, color: 'text-warn-text' },
                { label: 'Indispo', count: proposals.filter((p) => p.response === 'unavailable').length, color: 'text-bad' },
                { label: 'Sans réponse', count: proposals.filter((p) => p.response === 'no_response').length, color: 'text-ink-3' },
              ].map(({ label, count, color }) => (
                <span key={label} className={`font-medium ${color}`}>{count} {label}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Compétences</h2>
          {canManageVolunteer && !editingSkills && (
            <Button
              variant="ghost"
              onClick={() => setEditingSkills(true)}
            >
              Modifier
            </Button>
          )}
          {canManageVolunteer && editingSkills && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => { setEditingSkills(false); setSaveError(null); }}
                disabled={saving}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                onClick={saveSkills}
                disabled={saving}
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          )}
        </div>

        {saveError && (
          <div className="mb-3 rounded-md border border-bad/30 bg-bad-soft p-2 text-xs text-bad">{saveError}</div>
        )}

        {!editingSkills ? (
          currentSkills.length === 0 ? (
            <p className="text-sm text-ink-3">Aucune compétence.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {currentSkills.map((s) => (
                <SkillBadge key={s.id} name={s.name} color={s.category?.color} />
              ))}
            </div>
          )
        ) : (
          <div className="space-y-3">
            {categories.length === 0 ? (
              <p className="text-xs text-ink-3">Aucune catégorie de compétences définie.</p>
            ) : (
              categories.map((category) => {
                if (category.skills.length === 0) return null;
                const selectedSkillId = selectedSkillByCategory[category.id] ?? null;
                const selectedSkill = category.skills.find((s) => s.id === selectedSkillId);
                return (
                  <div key={category.id} className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{category.name}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedSkillByCategory((prev) => ({ ...prev, [category.id]: null }))}
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                          !selectedSkillId ? getSkillColorClass(category.color) : 'border-line-field bg-surface-sub text-ink-2'
                        }`}
                      >
                        Aucune
                      </button>
                      {category.skills.map((skill) => {
                        const isHighlighted = selectedSkill
                          ? skill.display_order <= selectedSkill.display_order
                          : false;
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() => setSelectedSkillByCategory((prev) => ({ ...prev, [category.id]: skill.id }))}
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium hover:opacity-80 ${
                              isHighlighted
                                ? getSkillColorClass(category.color)
                                : 'border-line-field bg-surface-sub text-ink-2'
                            }`}
                          >
                            {skill.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-ink">
          Missions (disponible)
          <span className="ml-2 text-sm font-normal text-ink-3">{availableMissions.length}</span>
        </h2>

        {availableMissions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-field bg-surface-card p-6 text-sm text-ink-3">
            Aucune mission où ce bénévole s&apos;est rendu disponible.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher une mission..."
                className="w-56 rounded-full border border-line-field bg-surface-sub px-3 py-1.5 text-sm text-ink-2 placeholder:text-ink-3 focus:border-accent focus:bg-surface-card focus:outline-none"
              />
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedTypeId(null)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    selectedTypeId === null
                      ? 'border-brand bg-brand text-white'
                      : 'border-line-field bg-surface-sub text-ink-2 hover:bg-line'
                  }`}
                >
                  Toutes
                </button>
                {MISSION_TYPE_OPTIONS.filter((opt) => presentTypeIds.has(opt.value)).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedTypeId(opt.value)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      selectedTypeId === opt.value
                        ? 'border-brand bg-brand text-white'
                        : 'border-line-field bg-surface-sub text-ink-2 hover:bg-line'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredMissions.length === 0 ? (
              <p className="text-sm text-ink-3">Aucun résultat pour ces filtres.</p>
            ) : (
              <div className="space-y-2">
                {filteredMissions.map((mission) => {
                  const retained = confirmedMissionIds.has(mission.id);
                  const category = getMissionCategory(mission.mission_type_id);
                  return (
                    <div key={mission.id} className="rounded-2xl border border-line bg-surface-card p-3 shadow-card">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link
                          href={`/missions/${mission.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {mission.title}
                        </Link>
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          <span className="inline-flex rounded-full border border-line bg-surface-sub px-2 py-0.5 text-xs font-medium text-ink-2">
                            {MISSION_CATEGORY_LABELS[category]}
                          </span>
                          {retained ? (
                            <span className="inline-flex rounded-full border border-ok-line bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok-text">
                              Retenu
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-line bg-surface-sub px-2 py-0.5 text-xs font-medium text-ink-3">
                              Non retenu
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-3">
                        <span>{formatDate(mission.starts_at)}</span>
                        {mission.location ? <span>{mission.location}</span> : null}
                        <span>{MISSION_STATUS_LABELS[mission.status]}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
