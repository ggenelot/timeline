'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  MISSION_CATEGORY_LABELS,
  MISSION_TYPE_OPTIONS,
  getMissionCategory,
  MissionStatus,
} from '@/lib/types';
import { SkillBadge } from '@/components/skills/skill-badge';

type SkillRef = { id: string; name: string; category_id: string | null; display_order: number };
type CategoryRef = { id: string; name: string; color: string };

type VolunteerProfile = {
  id: string;
  full_name: string | null;
  identifier: string | null;
  slack_user_id: string | null;
  slack_team_id: string | null;
  profile_skills: Array<{ skill_id: string; skill: SkillRef | SkillRef[] | null }> | null;
};

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

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
  const [error, setError] = useState<string | null>(null);
  const [volunteer, setVolunteer] = useState<VolunteerProfile | null>(null);
  const [categories, setCategories] = useState<CategoryRef[]>([]);
  const [proposals, setProposals] = useState<ProposalWithMission[]>([]);
  const [confirmedMissionIds, setConfirmedMissionIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (!profileData || !['admin', 'responsable'].includes(profileData.role as string)) {
        setError('Accès réservé aux administrateurs et responsables.');
        setLoading(false);
        return;
      }

      const [volunteerRes, proposalsRes, assignmentsRes, categoriesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, identifier, slack_user_id, slack_team_id, profile_skills(skill_id, skill:skills(id, name, category_id, display_order))')
          .eq('id', volunteerId)
          .single(),
        supabase
          .from('mission_proposals')
          .select('id, mission_id, mission:missions(id, title, starts_at, ends_at, location, mission_type_id, status)')
          .eq('volunteer_id', volunteerId)
          .eq('response', 'available')
          .order('created_at', { ascending: false }),
        supabase
          .from('mission_assignments')
          .select('mission_id, assignment_status')
          .eq('volunteer_id', volunteerId),
        supabase
          .from('skill_categories')
          .select('id, name, color')
          .order('display_order', { ascending: true }),
      ]);

      if (volunteerRes.error || !volunteerRes.data) {
        setError('Bénévole introuvable.');
        setLoading(false);
        return;
      }

      setVolunteer(volunteerRes.data as VolunteerProfile);
      setProposals((proposalsRes.data ?? []) as ProposalWithMission[]);
      setCategories((categoriesRes.data ?? []) as CategoryRef[]);

      const confirmed = new Set<string>(
        ((assignmentsRes.data ?? []) as AssignmentRow[])
          .filter((a) => a.assignment_status === 'confirmed')
          .map((a) => a.mission_id)
      );
      setConfirmedMissionIds(confirmed);
      setLoading(false);
    }

    if (volunteerId) void loadData();
  }, [router, volunteerId]);

  const skills = useMemo<SkillRef[]>(() => {
    if (!volunteer) return [];
    return (volunteer.profile_skills ?? [])
      .map((ps) => {
        const s = Array.isArray(ps.skill) ? ps.skill[0] : ps.skill;
        return s ?? null;
      })
      .filter((s): s is SkillRef => s !== null);
  }, [volunteer]);

  const missions = useMemo<MissionRow[]>(() =>
    proposals
      .map((p) => {
        const m = Array.isArray(p.mission) ? p.mission[0] : p.mission;
        return m ?? null;
      })
      .filter((m): m is MissionRow => m !== null),
    [proposals]
  );

  const presentTypeIds = useMemo(
    () => new Set(missions.map((m) => m.mission_type_id)),
    [missions]
  );

  const filteredMissions = useMemo(() => {
    const term = searchQuery.trim().toLocaleLowerCase('fr');
    return missions.filter((m) => {
      if (selectedTypeId && m.mission_type_id !== selectedTypeId) return false;
      if (term.length > 0) {
        const haystack = [m.title, m.location ?? ''].join(' ').toLocaleLowerCase('fr');
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [missions, selectedTypeId, searchQuery]);

  if (loading) return <p className="text-sm text-slate-600">Chargement...</p>;
  if (error) return <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  if (!volunteer) return null;

  const slackConnected = Boolean(volunteer.slack_user_id && volunteer.slack_team_id);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/admin/volunteers"
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                ← Bénévoles
              </Link>
            </div>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">
              {volunteer.full_name ?? '—'}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              {volunteer.identifier ? (
                <span className="font-mono">{volunteer.identifier}</span>
              ) : null}
              <span className={`inline-flex items-center gap-1.5`}>
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${slackConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {slackConnected ? 'Slack connecté' : 'Slack non connecté'}
              </span>
            </div>
          </div>
          <Link
            href={`/admin/volunteers/${volunteerId}/edit`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Modifier
          </Link>
        </div>

        {skills.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {skills.map((skill) => {
              const cat = categories.find((c) => c.id === skill.category_id);
              return <SkillBadge key={skill.id} name={skill.name} color={cat?.color} />;
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-400">Aucune compétence renseignée.</p>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          Missions (disponible)
          <span className="ml-2 text-sm font-normal text-slate-500">{missions.length}</span>
        </h2>

        {missions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            Aucune mission où ce bénévole s'est rendu disponible.
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
                    <div
                      key={mission.id}
                      className="rounded-lg border border-slate-200 bg-white p-3"
                    >
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
