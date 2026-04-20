'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, Skill } from '@/lib/types';
import { SkillBadge } from '@/components/skills/skill-badge';

type SkillOption = Pick<Skill, 'id' | 'name' | 'category'>;

type VolunteerSkill = {
  skill: SkillOption | SkillOption[] | null;
};

type VolunteerProfile = Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> & {
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
        .select('id,full_name,email,role,profile_skills(skill:skills(id,name,category))')
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

  const filteredVolunteers = useMemo(() => {
    if (selectedSkillId === 'all') {
      return volunteersWithSkills;
    }

    return volunteersWithSkills.filter(({ skills }) => skills.some((skill) => skill.id === selectedSkillId));
  }, [selectedSkillId, volunteersWithSkills]);

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
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[240px] flex-col gap-1 text-sm text-slate-700" htmlFor="skill-filter">
                <span className="font-medium">Filtrer par compétence</span>
                <select
                  id="skill-filter"
                  value={selectedSkillId}
                  onChange={(event) => setSelectedSkillId(event.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                >
                  <option value="all">Toutes les compétences</option>
                  {availableSkills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name}
                    </option>
                  ))}
                </select>
              </label>

              {selectedSkillId !== 'all' ? (
                <button
                  type="button"
                  onClick={() => setSelectedSkillId('all')}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Réinitialiser
                </button>
              ) : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-4 py-2 font-medium">Nom</th>
                  <th className="px-4 py-2 font-medium">Email</th>
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
