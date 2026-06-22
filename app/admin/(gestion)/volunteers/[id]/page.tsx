'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Skill, SkillCategory, MISSION_CATEGORY_LABELS, MISSION_TYPE_OPTIONS, getMissionCategory, MissionStatus } from '@/lib/types';
import { SkillBadge, getSkillColorClass } from '@/components/skills/skill-badge';

type CategoryWithSkills = SkillCategory & { skills: Skill[] };

type VolunteerProfile = {
  id: string;
  full_name: string | null;
  identifier: string | null;
  slack_user_id: string | null;
  slack_team_id: string | null;
  slack_username: string | null;
  slack_connected_at: string | null;
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
  const [isAdmin, setIsAdmin] = useState(false);

  const [volunteer, setVolunteer] = useState<VolunteerProfile | null>(null);
  const [categories, setCategories] = useState<CategoryWithSkills[]>([]);
  const [selectedSkillByCategory, setSelectedSkillByCategory] = useState<Record<string, string | null>>({});
  const [editingSkills, setEditingSkills] = useState(false);

  const [proposals, setProposals] = useState<Array<{ response: string }>>([]);
  const [confirmedAssignments, setConfirmedAssignments] = useState<Array<{ mission: MissionRef | MissionRef[] }>>([]);
  const [statPeriod, setStatPeriod] = useState<StatPeriod>(30);

  const [availableProposals, setAvailableProposals] = useState<ProposalWithMission[]>([]);
  const [confirmedMissionIds, setConfirmedMissionIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (!profileData) {
        setError('Accès réservé aux administrateurs et responsables.');
        setLoading(false);
        return;
      }

      if (profileData.role !== 'admin') {
        const { data: canManage } = await supabase.rpc('has_role_behavior', {
          _user_id: authData.user.id,
          _resource_type: 'mission',
          _behavior: 'can_manage',
        });
        if (!canManage) {
          setError('Accès réservé aux administrateurs et responsables.');
          setLoading(false);
          return;
        }
      }

      setIsAdmin(profileData.role === 'admin');

      const [volunteerRes, categoriesRes, proposalsRes, assignmentsRes, availableProposalsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id,full_name,identifier,slack_user_id,slack_team_id,slack_username,slack_connected_at,profile_skills(skill_id)')
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
      setLoading(false);
    }

    if (volunteerId) void loadData();
  }, [router, volunteerId]);

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

  if (loading) return <p className="text-sm text-slate-600">Chargement...</p>;
  if (error) return <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  if (!volunteer) return null;

  const currentSkills: Array<Skill & { category?: CategoryWithSkills }> = [];
  for (const [catId, skillId] of Object.entries(selectedSkillByCategory)) {
    if (!skillId) continue;
    const cat = categories.find((c) => c.id === catId);
    const skill = cat?.skills.find((s) => s.id === skillId);
    if (skill && cat) currentSkills.push({ ...skill, category: cat });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/admin/volunteers" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
              ← Bénévoles
            </Link>
            <h1 className="text-xl font-semibold text-slate-900">{volunteer.full_name ?? '—'}</h1>
            {volunteer.identifier && (
              <p className="mt-0.5 text-sm text-slate-500">{volunteer.identifier}</p>
            )}
          </div>
          {isAdmin && (
            <Link
              href={`/admin/volunteers/${volunteerId}/edit`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Modifier le compte
            </Link>
          )}
        </div>
      </div>

      {saved && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Compétences mises à jour.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Informations</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-slate-500">Identifiant</dt>
              <dd className="text-slate-800">{volunteer.identifier ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-slate-500">Compte Slack</dt>
              <dd>
                {volunteer.slack_user_id && volunteer.slack_team_id ? (
                  <span className="text-emerald-700">
                    Connecté{volunteer.slack_username ? ` (@${volunteer.slack_username})` : ''}
                  </span>
                ) : (
                  <span className="text-slate-400">Non connecté</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Statistiques</h2>
            <div className="flex gap-0.5 rounded border border-slate-200 p-0.5">
              {([7, 30, 90] as StatPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setStatPeriod(p)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                    statPeriod === p ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
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
              <div key={label} className="rounded-md bg-slate-50 p-2">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-0.5 text-lg font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
          {total > 0 && (
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              {[
                { label: 'Dispo', count: proposals.filter((p) => p.response === 'available').length, color: 'text-emerald-700' },
                { label: 'Peut-être', count: proposals.filter((p) => p.response === 'maybe').length, color: 'text-amber-700' },
                { label: 'Indispo', count: proposals.filter((p) => p.response === 'unavailable').length, color: 'text-red-700' },
                { label: 'Sans réponse', count: proposals.filter((p) => p.response === 'no_response').length, color: 'text-slate-400' },
              ].map(({ label, count, color }) => (
                <span key={label} className={`font-medium ${color}`}>{count} {label}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Compétences</h2>
          {isAdmin && !editingSkills && (
            <button
              type="button"
              onClick={() => setEditingSkills(true)}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Modifier
            </button>
          )}
          {isAdmin && editingSkills && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setEditingSkills(false); setSaveError(null); }}
                className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                disabled={saving}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveSkills}
                disabled={saving}
                className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          )}
        </div>

        {saveError && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{saveError}</div>
        )}

        {!editingSkills ? (
          currentSkills.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune compétence.</p>
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
              <p className="text-xs text-slate-400">Aucune catégorie de compétences définie.</p>
            ) : (
              categories.map((category) => {
                if (category.skills.length === 0) return null;
                const selectedSkillId = selectedSkillByCategory[category.id] ?? null;
                const selectedSkill = category.skills.find((s) => s.id === selectedSkillId);
                return (
                  <div key={category.id} className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{category.name}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedSkillByCategory((prev) => ({ ...prev, [category.id]: null }))}
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                          !selectedSkillId ? getSkillColorClass(category.color) : 'border-slate-300 bg-slate-100 text-slate-600'
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
                                : 'border-slate-300 bg-slate-100 text-slate-600'
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
        <h2 className="text-base font-semibold text-slate-900">
          Missions (disponible)
          <span className="ml-2 text-sm font-normal text-slate-500">{availableMissions.length}</span>
        </h2>

        {availableMissions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
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
                className="w-56 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-500 focus:border-emerald-500 focus:bg-white focus:outline-none"
              />
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedTypeId(null)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    selectedTypeId === null
                      ? 'border-slate-700 bg-slate-900 text-white'
                      : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                        ? 'border-slate-700 bg-slate-900 text-white'
                        : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredMissions.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun résultat pour ces filtres.</p>
            ) : (
              <div className="space-y-2">
                {filteredMissions.map((mission) => {
                  const retained = confirmedMissionIds.has(mission.id);
                  const category = getMissionCategory(mission.mission_type_id);
                  return (
                    <div key={mission.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link
                          href={`/missions/${mission.id}`}
                          className="font-medium text-slate-900 hover:underline"
                        >
                          {mission.title}
                        </Link>
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {MISSION_CATEGORY_LABELS[category]}
                          </span>
                          {retained ? (
                            <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                              Retenu
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                              Non retenu
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
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
