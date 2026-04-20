'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';

type SkillOption = {
  id: string;
  name: string;
};

type VolunteerSkill = {
  skill: SkillOption | SkillOption[] | null;
};

type VolunteerProfile = Pick<Profile, 'id' | 'full_name' | 'email' | 'role'> & {
  invitation_sent_at?: string | null;
  profile_skills: VolunteerSkill[] | null;
};

type VolunteersPageClientProps = {
  created: boolean;
  edited: boolean;
};

export function VolunteersPageClient({ created, edited }: VolunteersPageClientProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviteEmailByVolunteerId, setInviteEmailByVolunteerId] = useState<Record<string, string>>({});
  const [invitingVolunteerId, setInvitingVolunteerId] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      setError(null);
      setSuccess(null);

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
        .select('id,full_name,email,role,invitation_sent_at,profile_skills(skill:skills(id,name))')
        .eq('role', 'benevole')
        .order('full_name', { ascending: true });

      if (volunteersError) {
        setError(volunteersError.message);
        setLoading(false);
        return;
      }

      setVolunteers(volunteersData ?? []);
      setInviteEmailByVolunteerId(
        Object.fromEntries((volunteersData ?? []).map((volunteer) => [volunteer.id, volunteer.email ?? '']))
      );
      setLoading(false);
    }

    void loadData();
  }, [router]);

  const volunteerCountLabel = useMemo(() => {
    const count = volunteers.length;
    if (count <= 1) {
      return `${count} bénévole`;
    }

    return `${count} bénévoles`;
  }, [volunteers]);

  if (loading) {
    return <p className="text-sm text-slate-600">Chargement des bénévoles...</p>;
  }

  if (!profile) {
    return <p className="text-sm text-red-600">{error ?? 'Accès refusé.'}</p>;
  }

  async function handleInvite(volunteer: VolunteerProfile) {
    if (!profile || profile.role !== 'admin') {
      setError('Accès refusé : seuls les administrateurs peuvent inviter un bénévole.');
      return;
    }

    setError(null);
    setSuccess(null);
    setInvitingVolunteerId(volunteer.id);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setError('Session invalide. Veuillez vous reconnecter.');
      setInvitingVolunteerId(null);
      return;
    }

    const email = inviteEmailByVolunteerId[volunteer.id]?.trim().toLowerCase() ?? '';

    const response = await fetch(`/api/admin/volunteers/${volunteer.id}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        email
      })
    });

    const payload = (await response.json()) as { error?: string; message?: string; invitation_sent_at?: string };

    if (!response.ok) {
      setError(payload.error ?? "L'invitation n'a pas pu être envoyée.");
      setInvitingVolunteerId(null);
      return;
    }

    setSuccess(payload.message ?? 'Invitation envoyée.');
    setVolunteers((previous) =>
      previous.map((item) =>
        item.id === volunteer.id
          ? {
              ...item,
              email: email || item.email,
              invitation_sent_at: payload.invitation_sent_at ?? new Date().toISOString()
            }
          : item
      )
    );
    setInvitingVolunteerId(null);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Gestion des bénévoles</h1>
            <p className="mt-1 text-sm text-slate-600">{volunteerCountLabel} enregistré(s).</p>
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
      {success ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div> : null}

      {volunteers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          Aucun bénévole enregistré pour le moment.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-4 py-2 font-medium">Nom</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Compétences</th>
                <th className="px-4 py-2 font-medium">Statut compte</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {volunteers.map((volunteer) => {
                const skillBadges = (volunteer.profile_skills ?? [])
                  .flatMap((profileSkill) => {
                    if (!profileSkill.skill) {
                      return [];
                    }

                    return Array.isArray(profileSkill.skill) ? profileSkill.skill : [profileSkill.skill];
                  })
                  .filter((skill): skill is SkillOption => Boolean(skill));

                return (
                  <tr key={volunteer.id}>
                    <td className="px-4 py-2 text-slate-900">{volunteer.full_name ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-700">
                      <input
                        type="email"
                        value={inviteEmailByVolunteerId[volunteer.id] ?? ''}
                        onChange={(event) =>
                          setInviteEmailByVolunteerId((previous) => ({
                            ...previous,
                            [volunteer.id]: event.target.value
                          }))
                        }
                        placeholder="email@exemple.org"
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        disabled={invitingVolunteerId === volunteer.id}
                      />
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {skillBadges.length === 0 ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Aucune</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {skillBadges.map((skill) => (
                            <span key={`${volunteer.id}-${skill.id}`} className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                              {skill.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {!volunteer.email ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Pas de compte</span>
                      ) : volunteer.invitation_sent_at ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Invitation envoyée</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Pas de compte</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void handleInvite(volunteer)}
                          disabled={invitingVolunteerId === volunteer.id}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {invitingVolunteerId === volunteer.id ? 'Envoi...' : 'Inviter'}
                        </button>
                        <Link href={`/admin/volunteers/${volunteer.id}/edit`} className="text-slate-900 underline hover:text-slate-700">
                          Modifier
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
