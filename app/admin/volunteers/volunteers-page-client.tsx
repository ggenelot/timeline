'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, Skill } from '@/lib/types';
import { SkillBadge } from '@/components/skills/skill-badge';
import { getSkillBadgeClass } from '@/components/skills/skill-badge';
import { compareSkillCodes, expandSkills, getSkillLabel, resolveSkillCode, SkillCode } from '@/lib/skills';

type SkillOption = Pick<Skill, 'id' | 'name' | 'category'>;

type VolunteerSkill = {
  skill: SkillOption | SkillOption[] | null;
};

type VolunteerProfile = Pick<Profile, 'id' | 'full_name' | 'identifier' | 'role' | 'slack_user_id' | 'slack_team_id' | 'slack_username' | 'slack_connected_at'> & {
  profile_skills: VolunteerSkill[] | null;
};

type VolunteersPageClientProps = {
  created: boolean;
  edited: boolean;
};

export function VolunteersPageClient({ created, edited }: VolunteersPageClientProps) {
  const neutralSkillBadgeClass = 'inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [selectedSkillByCategory, setSelectedSkillByCategory] = useState<Record<string, string | null>>({});
  const [skillsDirectory, setSkillsDirectory] = useState<SkillOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const normalizedSkillsDirectory = useMemo(() =>
    skillsDirectory.map((skill) => ({ ...skill, code: resolveSkillCode(skill.name) })),
    [skillsDirectory]
  );

  const codeToSkillId = useMemo(() => {
    const map = new Map<SkillCode, string>();
    for (const skill of normalizedSkillsDirectory) {
      if (skill.code) {
        map.set(skill.code, skill.id);
      }
    }
    return map;
  }, [normalizedSkillsDirectory]);

  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace('/login');
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id,full_name,email,role,sector,created_at')
        .eq('id', authData.user.id)
        .single();

      if (!profileData) {
        setError('Profil introuvable.');
        setLoading(false);
        return;
      }

      if (profileData.role !== 'admin') {
        setError('Accès réservé aux administrateurs.');
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: volunteersData, error: volunteersError } = await supabase
        .from('profiles')
        .select('id,full_name,identifier,role,slack_user_id,slack_team_id,slack_username,slack_connected_at,profile_skills(skill:skills(id,name,category))')
        .eq('role', 'benevole')
        .order('full_name', { ascending: true });

      if (volunteersError) {
        setError(volunteersError.message);
        setLoading(false);
        return;
      }

      const { data: skillsData, error: skillsError } = await supabase
        .from('skills')
        .select('id,name,category')
        .order('name', { ascending: true });

      if (skillsError) {
        setError(skillsError.message);
        setLoading(false);
        return;
      }

      setVolunteers(volunteersData ?? []);
      setSkillsDirectory(skillsData ?? []);
      setLoading(false);
    }

    void loadData();
  }, [router]);

  const volunteersWithSkills = useMemo(
    () =>
      volunteers.map((volunteer) => {
        const explicitSkills = (volunteer.profile_skills ?? [])
          .flatMap((profileSkill) => {
            if (!profileSkill.skill) {
              return [];
            }

            return Array.isArray(profileSkill.skill) ? profileSkill.skill : [profileSkill.skill];
          })
          .filter((skill): skill is SkillOption => Boolean(skill));

        const explicitCodes = explicitSkills
          .map((skill) => resolveSkillCode(skill.name))
          .filter((skillCode): skillCode is SkillCode => skillCode !== null);

        const expandedCodes = expandSkills(explicitCodes);

        const expandedSkills = expandedCodes
          .map((skillCode) => {
            const skillId = codeToSkillId.get(skillCode);
            if (!skillId) {
              return null;
            }

            const existing = explicitSkills.find((skill) => skill.id === skillId);
            if (existing) {
              return existing;
            }

            return {
              id: skillId,
              name: getSkillLabel(skillCode),
              category: normalizedSkillsDirectory.find((skill) => skill.id === skillId)?.category ?? null
            };
          })
          .filter((skill): skill is SkillOption => Boolean(skill));

        return {
          volunteer,
          explicitSkills,
          skills: expandedSkills
        };
      }),
    [codeToSkillId, normalizedSkillsDirectory, volunteers]
  );

  const availableSkills = useMemo(() => {
    return [...normalizedSkillsDirectory].sort((a, b) => {
      if (a.code && b.code) {
        return compareSkillCodes(a.code, b.code);
      }
      if (a.code) return -1;
      if (b.code) return 1;
      return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
    });
  }, [normalizedSkillsDirectory]);

  const availableSkillsByCategory = useMemo(() => {
    const groups = new Map<string, SkillOption[]>();

    for (const skill of availableSkills) {
      const rawCategory = (skill.category ?? '').toLowerCase();
      const categoryKey = rawCategory === 'technique' ? 'conduite' : rawCategory;
      if (!['conduite', 'formation', 'operationnel', 'accso'].includes(categoryKey)) {
        continue;
      }
      const current = groups.get(categoryKey) ?? [];
      current.push(skill);
      groups.set(categoryKey, current);
    }

    const categoryOrder = ['conduite', 'formation', 'operationnel', 'accso'];
    const categoryLabels: Record<string, string> = {
      conduite: 'CONDUITE',
      formation: 'FORMATION',
      operationnel: 'OPERATIONNEL',
      accso: 'ACCSO',
    };

    return Array.from(groups.entries())
      .sort((a, b) => {
        const indexA = categoryOrder.indexOf(a[0]);
        const indexB = categoryOrder.indexOf(b[0]);
        if (indexA === -1 && indexB === -1) return a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' });
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      })
      .map(([category, skills]) => ({
        category,
        label: categoryLabels[category] ?? category.toLocaleUpperCase('fr'),
        skills
      }));
  }, [availableSkills]);

  const skillCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { skills } of volunteersWithSkills) {
      const uniqueIds = new Set(skills.map((skill) => skill.id));
      for (const id of uniqueIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [volunteersWithSkills]);

  const filteredVolunteers = useMemo(() => {
    return volunteersWithSkills.filter(({ volunteer, skills }) => {
      const searchTerm = searchQuery.trim().toLocaleLowerCase('fr');
      const matchesSearch =
        searchTerm.length === 0 ||
        [volunteer.full_name ?? '', volunteer.identifier ?? '', ...skills.map((skill) => skill.name)]
          .join(' ')
          .toLocaleLowerCase('fr')
          .includes(searchTerm);

      if (!matchesSearch) {
        return false;
      }

      const activeSkillIds = Object.values(selectedSkillByCategory).filter((id): id is string => Boolean(id));
      if (activeSkillIds.length === 0) {
        return true;
      }

      return activeSkillIds.every((selectedSkillId) => skills.some((skill) => skill.id === selectedSkillId));
    });
  }, [searchQuery, selectedSkillByCategory, volunteersWithSkills]);

  const toggleSkillFilter = (category: string, skillId: string | null) => {
    setSelectedSkillByCategory((current) => ({
      ...current,
      [category]: current[category] === skillId ? null : skillId
    }));
  };

  const volunteerCountLabel = useMemo(() => {
    const count = filteredVolunteers.length;
    if (count <= 1) {
      return `${count} bénévole`;
    }

    return `${count} bénévoles`;
  }, [filteredVolunteers.length]);

  if (loading) {
    return <p className="text-sm text-slate-600">Chargement des bénévoles...</p>;
  }

  if (!profile) {
    return <p className="text-sm text-red-600">{error ?? 'Accès refusé.'}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Gestion des bénévoles</h1>
            <p className="mt-1 text-sm text-slate-600">{volunteerCountLabel} affiché(s).</p>
          </div>
          <Link
            href="/admin/volunteers/create"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Ajouter un bénévole
          </Link>
        </div>
      </div>

      {created ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Le bénévole a été ajouté avec succès.
        </div>
      ) : null}

      {edited ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Le bénévole a été modifié avec succès.
        </div>
      ) : null}

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {volunteers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          Aucun bénévole enregistré pour le moment.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="space-y-4">
              <label className="block" htmlFor="volunteer-search">
                <input
                  id="volunteer-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Nom, identifiant ou compétence"
                  className="w-full rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-700 placeholder:text-slate-500 focus:border-emerald-500 focus:bg-white focus:outline-none"
                />
              </label>

              <div className="space-y-3">
                {availableSkillsByCategory.map(({ category, label, skills }) => {
                  const selectedSkillId = selectedSkillByCategory[category] ?? null;
                  const selectedSkillIndex = skills.findIndex((skill) => skill.id === selectedSkillId);

                  return (
                    <div key={category} className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleSkillFilter(category, null)}
                          className={`${getSkillBadgeClass(category)} px-2.5 py-1`}
                        >
                          Toutes
                        </button>
                        {skills.map((skill, skillIndex) => {
                          const count = skillCounts.get(skill.id) ?? 0;
                          const shouldUseCategoryColor = selectedSkillIndex >= 0 && skillIndex <= selectedSkillIndex;

                          return (
                            <button
                              key={skill.id}
                              type="button"
                              onClick={() => toggleSkillFilter(category, skill.id)}
                              className={`${shouldUseCategoryColor ? getSkillBadgeClass(skill.category) : neutralSkillBadgeClass} hover:opacity-80`}
                            >
                              {skill.name} {count}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-4 py-2 font-medium">Nom</th>
                  <th className="px-4 py-2 font-medium">Identifiant</th>
                  <th className="px-4 py-2 font-medium">Compte Slack</th>
                  <th className="px-4 py-2 font-medium">Compétences</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVolunteers.map(({ volunteer, explicitSkills }) => (
                  <tr key={volunteer.id}>
                    <td className="px-4 py-2 text-slate-900">{volunteer.full_name ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-700">{volunteer.identifier ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-700">
                      {volunteer.slack_user_id && volunteer.slack_team_id ? (
                        <div className="space-y-1">
                          <p className="font-medium text-emerald-700">
                            Connecté ({volunteer.slack_username ? `@${volunteer.slack_username}` : `${volunteer.slack_team_id} / ${volunteer.slack_user_id}`})
                          </p>
                          {volunteer.slack_connected_at ? (
                            <p className="text-xs text-slate-500">
                              Lié le {new Date(volunteer.slack_connected_at).toLocaleString('fr-FR')}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Non connecté</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {explicitSkills.length === 0 ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Aucune</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {explicitSkills.map((skill) => (
                            <SkillBadge key={`${volunteer.id}-${skill.id}`} name={skill.name} category={skill.category} />
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      <Link href={`/admin/volunteers/${volunteer.id}/edit`} className="text-slate-900 underline hover:text-slate-700">
                        Modifier
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
