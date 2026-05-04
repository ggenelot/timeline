'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, Skill } from '@/lib/types';
import { SkillBadge } from '@/components/skills/skill-badge';
import { getSkillBadgeClass } from '@/components/skills/skill-badge';

type SkillOption = Pick<Skill, 'id' | 'name' | 'category'>;

type VolunteerSkill = {
  skill: SkillOption | SkillOption[] | null;
};

type VolunteerProfile = Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'slack_user_id' | 'slack_team_id' | 'slack_username' | 'slack_connected_at'> & {
  profile_skills: VolunteerSkill[] | null;
};

type VolunteersPageClientProps = {
  created: boolean;
  edited: boolean;
};

export function VolunteersPageClient({ created, edited }: VolunteersPageClientProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        .select('id,full_name,email,phone,role,sector,created_at')
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
        .select('id,full_name,email,role,slack_user_id,slack_team_id,slack_username,slack_connected_at,profile_skills(skill:skills(id,name,category))')
        .eq('role', 'benevole')
        .order('full_name', { ascending: true });

      if (volunteersError) {
        setError(volunteersError.message);
        setLoading(false);
        return;
      }

      setVolunteers(volunteersData ?? []);
      setLoading(false);
    }

    void loadData();
  }, [router]);

  const volunteersWithSkills = useMemo(
    () =>
      volunteers.map((volunteer) => {
        const skills = (volunteer.profile_skills ?? [])
          .flatMap((profileSkill) => {
            if (!profileSkill.skill) {
              return [];
            }

            return Array.isArray(profileSkill.skill) ? profileSkill.skill : [profileSkill.skill];
          })
          .filter((skill): skill is SkillOption => Boolean(skill));

        return {
          volunteer,
          skills
        };
      }),
    [volunteers]
  );

  const availableSkills = useMemo(() => {
    const uniqueSkills = new Map<string, SkillOption>();

    volunteersWithSkills.forEach(({ skills }) => {
      skills.forEach((skill) => {
        uniqueSkills.set(skill.id, skill);
      });
    });

    return Array.from(uniqueSkills.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  }, [volunteersWithSkills]);

  const availableSkillsByCategory = useMemo(() => {
    const groups = new Map<string, SkillOption[]>();

    for (const skill of availableSkills) {
      const categoryKey = skill.category ?? 'autres';
      const current = groups.get(categoryKey) ?? [];
      current.push(skill);
      groups.set(categoryKey, current);
    }

    const categoryOrder = ['formation', 'operationnel', 'conduite', 'accso', 'autres'];

    return Array.from(groups.entries())
      .sort((a, b) => categoryOrder.indexOf(a[0]) - categoryOrder.indexOf(b[0]))
      .map(([category, skills]) => ({
        category,
        skills: skills.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
      }));
  }, [availableSkills]);

  const filteredVolunteers = useMemo(() => {
    return volunteersWithSkills.filter(({ volunteer, skills }) => {
      const searchTerm = searchQuery.trim().toLocaleLowerCase('fr');
      const matchesSearch =
        searchTerm.length === 0 ||
        [volunteer.full_name ?? '', volunteer.email, ...skills.map((skill) => skill.name)]
          .join(' ')
          .toLocaleLowerCase('fr')
          .includes(searchTerm);

      if (!matchesSearch) {
        return false;
      }

      if (selectedSkillId === 'all') {
        return true;
      }

      return skills.some((skill) => skill.id === selectedSkillId);
    });
  }, [searchQuery, selectedSkillId, volunteersWithSkills]);

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
              <label className="flex flex-col gap-1 text-sm text-slate-700" htmlFor="volunteer-search">
                <span className="font-medium">Rechercher</span>
                <input
                  id="volunteer-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Nom, email ou compétence"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                />
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-700">Filtrer par compétence</span>
                  {(selectedSkillId !== 'all' || searchQuery.trim().length > 0) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSkillId('all');
                        setSearchQuery('');
                      }}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Réinitialiser
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSkillId('all')}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      selectedSkillId === 'all' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    Toutes
                  </button>
                </div>

                {availableSkillsByCategory.map(({ category, skills }) => (
                  <div key={category} className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{category}</p>
                    <div className="flex flex-wrap gap-2">
                      {skills.map((skill) => {
                        const isSelected = selectedSkillId === skill.id;

                        return (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() => setSelectedSkillId(skill.id)}
                            className={`${getSkillBadgeClass(skill.category)} ${isSelected ? 'ring-2 ring-slate-400 ring-offset-1' : 'hover:opacity-80'}`}
                          >
                            {skill.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-4 py-2 font-medium">Nom</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Compte Slack</th>
                  <th className="px-4 py-2 font-medium">Compétences</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVolunteers.map(({ volunteer, skills }) => (
                  <tr key={volunteer.id}>
                    <td className="px-4 py-2 text-slate-900">{volunteer.full_name ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-700">{volunteer.email}</td>
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
                      {skills.length === 0 ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Aucune</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {skills.map((skill) => (
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
