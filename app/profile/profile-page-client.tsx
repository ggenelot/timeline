'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, Role, RoleBehavior, Skill, SkillCategory } from '@/lib/types';
import { SkillBadge, getSkillColorClass } from '@/components/skills/skill-badge';

export function ProfilePageClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [slackConnectError, setSlackConnectError] = useState<string | null>(null);
  const [calendarLinks, setCalendarLinks] = useState<{ all: string; positioned: string; retained: string } | null>(null);
  const [copiedCalendarUrl, setCopiedCalendarUrl] = useState<string | null>(null);
  const [categoriesWithSkills, setCategoriesWithSkills] = useState<Array<SkillCategory & { skills: Skill[] }>>([]);
  const [acquiredSkillIds, setAcquiredSkillIds] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<Array<Role & { behaviors: RoleBehavior[] }>>([]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [statPeriod, setStatPeriod] = useState<7 | 30 | 90>(30);
  const [proposals, setProposals] = useState<Array<{ response: string }>>([]);
  const [confirmedAssignments, setConfirmedAssignments] = useState<Array<{ mission: { starts_at: string | null } | { starts_at: string | null }[] | null }>>([]);
  const searchParams = useSearchParams();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        window.location.href = '/login';
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';
      if (token) {
        const origin = window.location.origin;
        setCalendarLinks({
          all: `${origin}/api/calendar?filter=all&token=${encodeURIComponent(token)}`,
          positioned: `${origin}/api/calendar?filter=positioned&token=${encodeURIComponent(token)}`,
          retained: `${origin}/api/calendar?filter=retained&token=${encodeURIComponent(token)}`
        });
      } else {
        setCalendarLinks(null);
      }

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id,full_name,email,role,sector,created_at,slack_user_id,slack_team_id,slack_username,slack_connected_at')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !data) {
        setError('Impossible de charger votre profil.');
      } else {
        setProfile(data);

        const rolesRes = await fetch('/api/roles/mine', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (rolesRes.ok) {
          const rolesJson = (await rolesRes.json()) as { roles: Role[]; behaviors: RoleBehavior[] };
          const rolesWithBehaviors = rolesJson.roles.map((role) => ({
            ...role,
            behaviors: rolesJson.behaviors.filter((b) => b.role_id === role.id)
          }));
          setRoles(rolesWithBehaviors);
        }

        if (data.role === 'benevole') {
          const [catsRes, profileSkillsRes, proposalsRes, assignmentsRes] = await Promise.all([
            supabase
              .from('skill_categories')
              .select('id,name,color,display_order,created_at,skills(id,name,display_order,category_id,created_at)')
              .order('display_order', { ascending: true })
              .order('display_order', { referencedTable: 'skills', ascending: true }),
            supabase.from('profile_skills').select('skill_id').eq('profile_id', data.id),
            supabase.from('mission_proposals').select('response').eq('volunteer_id', data.id),
            supabase
              .from('mission_assignments')
              .select('mission:missions(starts_at)')
              .eq('volunteer_id', data.id)
              .eq('assignment_status', 'confirmed'),
          ]);

          setCategoriesWithSkills((catsRes.data ?? []) as Array<SkillCategory & { skills: Skill[] }>);
          setAcquiredSkillIds(new Set((profileSkillsRes.data ?? []).map((row) => row.skill_id)));
          setProposals((proposalsRes.data ?? []) as Array<{ response: string }>);
          setConfirmedAssignments(assignmentsRes.data ?? []);
        }
      }

      const slackStatus = searchParams.get('slack');
      if (slackStatus === 'connected') {
        setSuccess('Compte Slack connecté avec succès.');
      } else if (slackStatus === 'expired') {
        setError('Lien Slack expiré ou déjà utilisé.');
      } else if (slackStatus === 'error') {
        const reason = searchParams.get('slack_reason');
        setError(reason ? `Connexion Slack échouée: ${reason}` : 'Connexion Slack échouée.');
      }

      setLoading(false);
    }

    void load();
  }, [searchParams]);

  async function handleConnectSlack() {
    setWorking(true);
    setError(null);
    setSlackConnectError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setSlackConnectError('Session invalide.');
      setWorking(false);
      return;
    }

    let response: Response;
    try {
      response = await fetch('/api/slack/connect/start', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch {
      setSlackConnectError('Impossible de joindre Slack pour le moment. Réessayez dans un instant.');
      setWorking(false);
      return;
    }

    const payload = (await response.json()) as { oauthUrl?: string; error?: string };

    if (!response.ok || !payload.oauthUrl) {
      setSlackConnectError(payload.error ?? 'Impossible de démarrer la connexion Slack.');
      setWorking(false);
      return;
    }

    window.location.href = payload.oauthUrl;
  }

  async function handleDisconnectSlack() {
    setWorking(true);
    setError(null);
    setSuccess(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError('Session invalide.');
      setWorking(false);
      return;
    }

    const response = await fetch('/api/slack/connect', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const payload = (await response.json()) as { error?: string; message?: string };

    if (!response.ok) {
      setError(payload.error ?? 'Déconnexion Slack impossible.');
      setWorking(false);
      return;
    }

    setProfile((previous) =>
      previous
        ? {
            ...previous,
            slack_user_id: null,
            slack_team_id: null,
            slack_username: null,
            slack_connected_at: null
          }
        : previous
    );
    setSuccess(payload.message ?? 'Compte Slack déconnecté.');
    setWorking(false);
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setWorking(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      setError(updateError.message || 'Impossible de modifier le mot de passe.');
      setWorking(false);
      return;
    }

    setSuccess('Votre mot de passe a bien été mis à jour.');
    setNewPassword('');
    setConfirmPassword('');
    setWorking(false);
  }

  async function handleCopyCalendarUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCalendarUrl(url);
      window.setTimeout(() => {
        setCopiedCalendarUrl((current) => (current === url ? null : current));
      }, 2000);
    } catch {
      setError("Impossible de copier l'URL. Veuillez réessayer.");
    }
  }

  const volunteerCalendarLinks = calendarLinks
    ? [
        { href: calendarLinks.all, label: 'Flux calendrier : toutes les missions proposées' },
        { href: calendarLinks.positioned, label: 'Flux calendrier : missions où je me suis positionné' },
        { href: calendarLinks.retained, label: 'Flux calendrier : missions où je suis retenu' }
      ]
    : [];

  if (loading) {
    return <p className="text-sm text-slate-600">Chargement...</p>;
  }

  if (!profile) {
    return <p className="text-sm text-red-600">{error ?? 'Profil introuvable.'}</p>;
  }

  const isSlackConnected = Boolean(profile.slack_user_id && profile.slack_team_id);
  const isVolunteer = profile.role === 'benevole';
  const neutralBadgeClass = 'inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500';

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <h1 className="text-xl font-semibold text-slate-900">Mon profil</h1>

      {error ? <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p> : null}

      <div className="space-y-1 text-sm text-slate-700">
        <p><span className="font-medium">Nom:</span> {profile.full_name ?? 'Non renseigné'}</p>
        <p><span className="font-medium">Email:</span> {profile.email}</p>
        <p><span className="font-medium">Rôle:</span> {profile.role}</p>
      </div>

      {roles.length > 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">Mes rôles</p>
          <div className="mt-2 space-y-2">
            {roles.map((role) => (
              <div key={role.id}>
                <p className="font-medium text-slate-800">{role.name}</p>
                {role.description ? <p className="text-xs text-slate-500">{role.description}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isVolunteer ? (
        <div className="space-y-4 text-sm">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="font-medium text-slate-900">Calendriers personnalisés</p>
          <p className="mt-1 text-slate-700">Abonnez-vous à ces flux pour afficher automatiquement vos missions dans votre calendrier.</p>
          {volunteerCalendarLinks.length > 0 ? (
            <div className="mt-3 space-y-3">
              {volunteerCalendarLinks.map((link) => (
                <div key={link.href} className="space-y-1">
                  <p className="text-xs text-slate-600">{link.label}</p>
                  <button
                    type="button"
                    onClick={() => void handleCopyCalendarUrl(link.href)}
                    className="w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-2 text-left font-mono text-xs text-slate-700 transition hover:bg-slate-100"
                    title="Cliquer pour copier le lien"
                  >
                    {link.href}
                  </button>
                  {copiedCalendarUrl === link.href ? <p className="text-xs text-emerald-700">Lien copié.</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Session invalide : impossible de générer les URL de calendrier.</p>
          )}
          </div>

          <ProfileStats
            proposals={proposals}
            confirmedAssignments={confirmedAssignments}
            period={statPeriod}
            onPeriodChange={setStatPeriod}
          />

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div>
            <p className="font-medium text-slate-900">Mes compétences</p>
            <div className="mt-3 space-y-3">
              {categoriesWithSkills.map((cat) => {
                if (cat.skills.length === 0) return null;
                return (
                  <div key={cat.id} className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{cat.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {cat.skills.map((skill) => {
                        const isAcquired = acquiredSkillIds.has(skill.id);
                        return isAcquired ? (
                          <SkillBadge key={skill.id} name={skill.name} color={cat.color} />
                        ) : (
                          <span key={skill.id} className={neutralBadgeClass}>{skill.name}</span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>

          <form onSubmit={handleChangePassword} className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="font-medium text-slate-900">Sécurité</p>
            <p className="mt-1 text-slate-700">Changer mon mot de passe</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-700">
                Nouveau mot de passe
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="text-xs text-slate-700">
                Confirmer le mot de passe
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  autoComplete="new-password"
                  required
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={working}
              className="mt-3 rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Mettre à jour le mot de passe
            </button>
          </form>
        </div>
      ) : null}

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
        <p className="font-medium text-slate-900">Intégration Slack <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-800">Expérimental</span></p>
        <p className="mt-1 text-slate-700">
          État: {isSlackConnected ? `Connecté (${profile.slack_username ? `@${profile.slack_username}` : `${profile.slack_team_id} / ${profile.slack_user_id}`})` : 'Non connecté'}
        </p>
        {profile.slack_connected_at ? <p className="mt-1 text-xs text-slate-500">Connecté le {new Date(profile.slack_connected_at).toLocaleString('fr-FR')}</p> : null}
        <div className="mt-3 flex gap-2">
          {!isSlackConnected ? (
            <button
              type="button"
              onClick={handleConnectSlack}
              disabled={working}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Connecter Slack
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDisconnectSlack}
              disabled={working}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Déconnecter Slack
            </button>
          )}
        </div>
        {slackConnectError ? <p className="mt-2 text-xs text-red-600">{slackConnectError}</p> : null}
      </div>
    </section>
  );
}

type ProfileStatsProps = {
  proposals: Array<{ response: string }>;
  confirmedAssignments: Array<{ mission: { starts_at: string | null } | { starts_at: string | null }[] | null }>;
  period: 7 | 30 | 90;
  onPeriodChange: (p: 7 | 30 | 90) => void;
};

function ProfileStats({ proposals, confirmedAssignments, period, onPeriodChange }: ProfileStatsProps) {
  const total = proposals.length;
  const responded = proposals.filter((p) => p.response !== 'no_response').length;
  const available = proposals.filter((p) => p.response === 'available').length;
  const maybe = proposals.filter((p) => p.response === 'maybe').length;
  const unavailable = proposals.filter((p) => p.response === 'unavailable').length;
  const noResponse = proposals.filter((p) => p.response === 'no_response').length;
  const responseRate = total > 0 ? Math.round((responded / total) * 100) : null;

  const confirmedAllTime = confirmedAssignments.length;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - period);

  const confirmedInPeriod = confirmedAssignments.filter((a) => {
    const m = Array.isArray(a.mission) ? a.mission[0] : a.mission;
    if (!m?.starts_at) return false;
    return new Date(m.starts_at) >= cutoff;
  }).length;

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
      <p className="font-medium text-slate-900">Mes statistiques</p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Propositions reçues', value: total },
          { label: 'Taux de réponse', value: responseRate !== null ? `${responseRate} %` : '—' },
          { label: 'Missions confirmées', value: confirmedAllTime },
          { label: `Confirmées (${period} j)`, value: confirmedInPeriod },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-0.5 text-xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {total > 0 ? (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-slate-700">Répartition de mes réponses</p>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
              Disponible : {available}
            </span>
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
              Peut-être : {maybe}
            </span>
            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800">
              Indisponible : {unavailable}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              Sans réponse : {noResponse}
            </span>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-1">
        <p className="text-xs text-slate-500">Période :</p>
        {([7, 30, 90] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPeriodChange(p)}
            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              period === p ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            {p} j
          </button>
        ))}
      </div>
    </div>
  );
}
