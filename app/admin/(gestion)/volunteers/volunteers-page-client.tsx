'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, Skill, SkillCategory } from '@/lib/types';
import { SkillBadge, getSkillColorClass } from '@/components/skills/skill-badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { initials } from '@/components/ope/atoms';
import { cn } from '@/lib/cn';

type CategoryWithSkills = SkillCategory & { skills: Skill[] };

type SkillRef = { id: string; name: string; category_id: string | null; display_order: number };

type VolunteerSkillRow = {
  skill_id: string;
  skill: SkillRef | SkillRef[] | null;
};

type VolunteerProfile = Pick<Profile, 'id' | 'full_name' | 'identifier' | 'role' | 'slack_user_id' | 'slack_team_id' | 'slack_username' | 'slack_connected_at' | 'avatar_url'> & {
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
  const neutralSkillBadgeClass = 'inline-flex rounded-full border border-line bg-surface-sub px-2 py-0.5 text-xs font-medium text-ink-2';

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
          .select('id,full_name,identifier,role,slack_user_id,slack_team_id,slack_username,slack_connected_at,avatar_url,profile_skills(skill_id,skill:skills(id,name,category_id,display_order))')
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

  if (loading) return <p className="text-sm text-ink-2">Chargement des bénévoles...</p>;
  if (!profile) return <p className="text-sm text-bad">{error ?? 'Accès refusé.'}</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bénévoles"
        subtitle={`${volunteerCountLabel} affiché(s).`}
        actions={
          <Link href="/admin/volunteers/create">
            <Button variant="primary" icon="add" className="h-10">
              Ajouter un bénévole
            </Button>
          </Link>
        }
      />

      {created ? (
        <div className="rounded-[11px] border border-ok-line bg-ok-soft p-3 text-sm text-ok-text">
          Le bénévole a été ajouté avec succès.
        </div>
      ) : null}
      {edited ? (
        <div className="rounded-[11px] border border-ok-line bg-ok-soft p-3 text-sm text-ok-text">
          Le bénévole a été modifié avec succès.
        </div>
      ) : null}
      {error ? <div className="rounded-[11px] border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}

      {volunteers.length === 0 ? (
        <Card className="border-dashed p-6 text-sm text-ink-2">
          Aucun bénévole enregistré pour le moment.
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="space-y-4">
              <label className="relative block" htmlFor="volunteer-search">
                <Icon
                  name="search"
                  size={19}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3"
                />
                <input
                  id="volunteer-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Nom, identifiant ou compétence"
                  className="w-full rounded-full border border-line-field bg-surface-sub py-2 pl-11 pr-4 text-sm text-ink placeholder:text-ink-3 focus:border-accent-ring focus:bg-surface-card focus:outline-none"
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
                        <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">{category.name}</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => toggleSkillFilter(category.id, null)}
                            className={cn(
                              'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium transition hover:opacity-80',
                              !selectedSkillId ? getSkillColorClass(category.color) : neutralSkillBadgeClass
                            )}
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
                                className={cn(
                                  'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium transition hover:opacity-80',
                                  isSelected || isHighlighted ? getSkillColorClass(category.color) : neutralSkillBadgeClass
                                )}
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
          </Card>

          <Card className="overflow-hidden p-0">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-sub text-left">
                <tr className="border-b border-line-row">
                  <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">Nom</th>
                  <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">Identifiant</th>
                  <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">Slack</th>
                  <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">Compétences</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-row">
                {filteredVolunteers.map(({ volunteer, skills }) => (
                  <tr key={volunteer.id}>
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/admin/volunteers/${volunteer.id}`} className="flex items-center gap-2 font-semibold text-ink hover:underline">
                        {volunteer.avatar_url ? (
                          <img src={volunteer.avatar_url} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E4E8F0] text-[10px] font-semibold text-ink-2">
                            {initials(volunteer.full_name)}
                          </span>
                        )}
                        {volunteer.full_name ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-ink-2">{volunteer.identifier ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={cn('inline-block h-3 w-3 rounded-full', volunteer.slack_user_id && volunteer.slack_team_id ? 'bg-ok-bar' : 'bg-line-field')} />
                    </td>
                    <td className="px-4 py-2 text-ink-2">
                      {skills.length === 0 ? (
                        <span className="inline-flex rounded-full border border-line bg-surface-sub px-2 py-0.5 text-xs font-medium text-ink-2">Aucune</span>
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
          </Card>
        </>
      )}
    </div>
  );
}
