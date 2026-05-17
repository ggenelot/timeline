'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, Skill, SkillCategory } from '@/lib/types';
import { SkillBadge, getSkillColorClass } from '@/components/skills/skill-badge';

type CategoryWithSkills = SkillCategory & { skills: Skill[] };

type SkillRef = { id: string; name: string; category_id: string | null; display_order: number };

type VolunteerSkillRow = {
  skill_id: string;
  skill: SkillRef | SkillRef[] | null;
};

type VolunteerProfile = Pick<Profile, 'id' | 'full_name' | 'identifier' | 'role' | 'slack_user_id' | 'slack_team_id' | 'slack_username' | 'slack_connected_at'> & {
  profile_skills: VolunteerSkillRow[] | null;
};

type VolunteerWithSkills = {
  volunteer: VolunteerProfile;
  skills: SkillRef[];
};

type VolunteersPageClientProps = {
  created: boolean;
  edited: boolean;
};

export function VolunteersPageClient({ created, edited }: VolunteersPageClientProps) {
  const neutralSkillBadgeClass = 'inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [categories, setCategories] = useState<CategoryWithSkills[]>([]);
  const [selectedSkillByCategory, setSelectedSkillByCategory] = useState<Record<string, string | null>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id,full_name,email,role,sector,created_at')
        .eq('id', authData.user.id)
        .single();

      if (!profileData) { setError('Profil introuvable.'); setLoading(false); return; }
      if (profileData.role !== 'admin') { setError('Accès réservé aux administrateurs.'); setLoading(false); return; }

      setProfile(profileData);

      const [volunteersRes, categoriesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id,full_name,identifier,role,slack_user_id,slack_team_id,slack_username,slack_connected_at,profile_skills(skill_id,skill:skills(id,name,category_id,display_order))')
          .eq('role', 'benevole')
          .order('full_name', { ascending: true }),
        supabase
          .from('skill_categories')
          .select('id,name,color,display_order,created_at,skills(id,name,display_order,category_id,created_at)')
          .order('display_order', { ascending: true })
          .order('display_order', { referencedTable: 'skills', ascending: true }),
      ]);

      if (volunteersRes.error) { setError(volunteersRes.error.message); setLoading(false); return; }
      if (categoriesRes.error) { setError(categoriesRes.error.message); setLoading(false); return; }

      setVolunteers((volunteersRes.data ?? []) as VolunteerProfile[]);
      setCategories((categoriesRes.data ?? []) as CategoryWithSkills[]);
      setLoading(false);
    }

    void loadData();
  }, [router]);

  const volunteersWithSkills = useMemo<VolunteerWithSkills[]>(() =>
    volunteers.map((volunteer) => {
      const skills = (volunteer.profile_skills ?? [])
        .map((ps) => {
          const s = Array.isArray(ps.skill) ? ps.skill[0] : ps.skill;
          if (!s) return null;
          return { id: s.id, name: s.name, category_id: s.category_id, display_order: s.display_order };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);
      return { volunteer, skills };
    }),
    [volunteers]
  );

  const skillCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { skills } of volunteersWithSkills) {
      for (const skill of skills) {
        counts.set(skill.id, (counts.get(skill.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [volunteersWithSkills]);

  const filteredVolunteers = useMemo(() => {
    return volunteersWithSkills.filter(({ volunteer, skills }) => {
      const searchTerm = searchQuery.trim().toLocaleLowerCase('fr');
      const matchesSearch =
        searchTerm.length === 0 ||
        [volunteer.full_name ?? '', volunteer.identifier ?? '', ...skills.map((s) => s.name)]
          .join(' ')
          .toLocaleLowerCase('fr')
          .includes(searchTerm);

      if (!matchesSearch) return false;

      for (const [categoryId, selectedSkillId] of Object.entries(selectedSkillByCategory)) {
        if (!selectedSkillId) continue;
        const category = categories.find((c) => c.id === categoryId);
        const selectedSkill = category?.skills.find((s) => s.id === selectedSkillId);
        if (!selectedSkill) continue;

        const passes = skills.some(
          (s) => s.category_id === categoryId && s.display_order >= selectedSkill.display_order
        );
        if (!passes) return false;
      }

      return true;
    });
  }, [searchQuery, selectedSkillByCategory, volunteersWithSkills, categories]);

  const toggleSkillFilter = (categoryId: string, skillId: string | null) => {
    setSelectedSkillByCategory((current) => ({
      ...current,
      [categoryId]: current[categoryId] === skillId ? null : skillId,
    }));
  };

  const volunteerCountLabel = useMemo(() => {
    const count = filteredVolunteers.length;
    return `${count} bénévole${count !== 1 ? 's' : ''}`;
  }, [filteredVolunteers.length]);

  if (loading) return <p className="text-sm text-slate-600">Chargement des bénévoles...</p>;
  if (!profile) return <p className="text-sm text-red-600">{error ?? 'Accès refusé.'}</p>;

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

              {categories.length > 0 && (
                <div className="space-y-3">
                  {categories.map((category) => {
                    if (category.skills.length === 0) return null;
                    const selectedSkillId = selectedSkillByCategory[category.id] ?? null;
                    const selectedSkill = category.skills.find((s) => s.id === selectedSkillId);

                    return (
                      <div key={category.id} className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{category.name}</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => toggleSkillFilter(category.id, null)}
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                              !selectedSkillId
                                ? getSkillColorClass(category.color)
                                : 'border-slate-300 bg-slate-100 text-slate-600'
                            }`}
                          >
                            Toutes
                          </button>
                          {category.skills.map((skill) => {
                            const isSelected = selectedSkillId === skill.id;
                            const isHighlighted = selectedSkill
                              ? skill.display_order <= selectedSkill.display_order
                              : false;
                            const count = skillCounts.get(skill.id) ?? 0;

                            return (
                              <button
                                key={skill.id}
                                type="button"
                                onClick={() => toggleSkillFilter(category.id, skill.id)}
                                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium hover:opacity-80 ${
                                  isSelected || isHighlighted
                                    ? getSkillColorClass(category.color)
                                    : neutralSkillBadgeClass
                                }`}
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
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-4 py-2 font-medium">Nom</th>
                  <th className="px-4 py-2 font-medium">Identifiant</th>
                  <th className="px-4 py-2 font-medium">Slack</th>
                  <th className="px-4 py-2 font-medium">Compétences</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVolunteers.map(({ volunteer, skills }) => (
                  <tr key={volunteer.id}>
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/admin/volunteers/${volunteer.id}`} className="text-slate-900 hover:underline">
                        {volunteer.full_name ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-700">{volunteer.identifier ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block h-3 w-3 rounded-full ${volunteer.slack_user_id && volunteer.slack_team_id ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {skills.length === 0 ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Aucune</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {skills.map((skill) => {
                            const cat = categories.find((c) => c.id === skill.category_id);
                            return (
                              <SkillBadge key={skill.id} name={skill.name} color={cat?.color} />
                            );
                          })}
                        </div>
                      )}
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
