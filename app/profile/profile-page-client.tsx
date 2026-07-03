'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, Role, RoleBehavior, Skill, SkillCategory } from '@/lib/types';
import { SkillBadge } from '@/components/skills/skill-badge';
import { Card, PageHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

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
        .select('id,full_name,email,role,sector,created_at,slack_user_id,slack_team_id,slack_username,slack_connected_at,avatar_url')
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
    return <p className="text-sm text-ink-2">Chargement...</p>;
  }

  if (!profile) {
    return <p className="text-sm text-bad">{error ?? 'Profil introuvable.'}</p>;
  }

  const isSlackConnected = Boolean(profile.slack_user_id && profile.slack_team_id);
  const isVolunteer = profile.role === 'benevole';
  const overlineClass = 'text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3';

  return (
    <section className="space-y-4">
      <PageHeader title="Mon profil" />

      {error ? (
        <p className="rounded-[10px] border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-[10px] border border-ok-line bg-ok-soft px-3 py-2 text-sm text-ok-text">{success}</p>
      ) : null}

      <Card className="p-4">
        <p className={overlineClass}>Mon compte</p>
        <div className="mt-3 flex items-start gap-3">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
          ) : null}
          <div className="space-y-1.5 text-sm text-ink-2">
            <p><span className="font-semibold text-ink">Nom :</span> {profile.full_name ?? 'Non renseigné'}</p>
            <p><span className="font-semibold text-ink">Email :</span> {profile.email}</p>
            <p><span className="font-semibold text-ink">Rôle :</span> {profile.role}</p>
          </div>
        </div>
      </Card>

      {roles.length > 0 ? (
        <Card className="p-4">
          <p className={overlineClass}>Mes rôles</p>
          <div className="mt-3 space-y-2 text-sm">
            {roles.map((role) => (
              <div key={role.id}>
                <p className="font-semibold text-ink">{role.name}</p>
                {role.description ? <p className="text-xs text-ink-3">{role.description}</p> : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {isVolunteer ? (
        <div className="space-y-4 text-sm">
          <Card className="p-4">
          <p className={overlineClass}>Calendriers personnalisés</p>
          <p className="mt-2 text-ink-2">Abonnez-vous à ces flux pour afficher automatiquement vos missions dans votre calendrier.</p>
          {volunteerCalendarLinks.length > 0 ? (
            <div className="mt-3 space-y-3">
              {volunteerCalendarLinks.map((link) => (
                <div key={link.href} className="space-y-1">
                  <p className="text-xs text-ink-2">{link.label}</p>
                  <button
                    type="button"
                    onClick={() => void handleCopyCalendarUrl(link.href)}
                    className="flex w-full items-center gap-2 overflow-hidden rounded-[10px] border border-line-field bg-surface-sub px-3 py-2 text-left transition hover:bg-surface"
                    title="Cliquer pour copier le lien"
                  >
                    <Icon
                      name={copiedCalendarUrl === link.href ? 'check' : 'content_copy'}
                      size={16}
                      className={cn('shrink-0', copiedCalendarUrl === link.href ? 'text-ok-text' : 'text-ink-3')}
                    />
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-ink-2">
                      {link.href}
                    </span>
                  </button>
                  {copiedCalendarUrl === link.href ? <p className="text-xs text-ok-text">Lien copié.</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-ink-3">Session invalide : impossible de générer les URL de calendrier.</p>
          )}
          </Card>

          <ProfileStats
            proposals={proposals}
            confirmedAssignments={confirmedAssignments}
            period={statPeriod}
            onPeriodChange={setStatPeriod}
          />

          <Card className="p-4">
            <p className={overlineClass}>Mes compétences</p>
            <div className="mt-3 space-y-3">
              {categoriesWithSkills.map((cat) => {
                if (cat.skills.length === 0) return null;
                return (
                  <div key={cat.id} className="space-y-1.5">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">{cat.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {cat.skills.map((skill) => {
                        const isAcquired = acquiredSkillIds.has(skill.id);
                        return isAcquired ? (
                          <SkillBadge key={skill.id} name={skill.name} color={cat.color} />
                        ) : (
                          <span
                            key={skill.id}
                            className="inline-flex rounded-[7px] border border-line bg-surface-sub px-2 py-0.5 text-xs font-medium text-ink-3"
                          >
                            {skill.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card as="form" onSubmit={handleChangePassword} className="p-4">
            <p className={overlineClass}>Sécurité</p>
            <p className="mt-2 font-semibold text-ink">Changer mon mot de passe</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-ink-2">
                Nouveau mot de passe
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-[10px] border-[1.5px] border-line-field bg-surface-card px-3 text-sm text-ink outline-none focus:border-brand"
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="text-xs font-medium text-ink-2">
                Confirmer le mot de passe
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-[10px] border-[1.5px] border-line-field bg-surface-card px-3 text-sm text-ink outline-none focus:border-brand"
                  autoComplete="new-password"
                  required
                />
              </label>
            </div>
            <Button type="submit" variant="primary" disabled={working} className="mt-4">
              Mettre à jour le mot de passe
            </Button>
          </Card>
        </div>
      ) : null}

      <Card className="p-4 text-sm">
        <div className="flex items-center gap-2">
          <p className={overlineClass}>Intégration Slack</p>
          <Badge tone="warn">Expérimental</Badge>
        </div>
        <p className="mt-2 text-ink-2">
          État : {isSlackConnected ? `Connecté (${profile.slack_username ? `@${profile.slack_username}` : `${profile.slack_team_id} / ${profile.slack_user_id}`})` : 'Non connecté'}
        </p>
        {profile.slack_connected_at ? <p className="mt-1 text-xs text-ink-3">Connecté le {new Date(profile.slack_connected_at).toLocaleString('fr-FR')}</p> : null}
        <div className="mt-3 flex gap-2">
          {!isSlackConnected ? (
            <Button type="button" variant="primary" onClick={handleConnectSlack} disabled={working} icon="forum">
              Connecter Slack
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={handleDisconnectSlack} disabled={working} icon="logout">
              Déconnecter Slack
            </Button>
          )}
        </div>
        {slackConnectError ? <p className="mt-2 text-xs text-bad">{slackConnectError}</p> : null}
      </Card>
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
    <Card className="p-4 text-sm">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">Mes statistiques</p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Propositions reçues', value: total },
          { label: 'Taux de réponse', value: responseRate !== null ? `${responseRate} %` : '—' },
          { label: 'Missions confirmées', value: confirmedAllTime },
          { label: `Confirmées (${period} j)`, value: confirmedInPeriod },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-[12px] border border-line bg-surface-sub p-3">
            <p className="text-xs text-ink-3">{label}</p>
            <p className="mt-1 font-display text-[26px] leading-none text-ink">{value}</p>
          </div>
        ))}
      </div>

      {total > 0 ? (
        <div className="mt-4 space-y-1.5">
          <p className="text-xs font-semibold text-ink-2">Répartition de mes réponses</p>
          <div className="flex flex-wrap gap-2">
            <Badge tone="ok">Disponible : {available}</Badge>
            <Badge tone="warn">Peut-être : {maybe}</Badge>
            <Badge tone="bad">Indisponible : {unavailable}</Badge>
            <Badge tone="neutral">Sans réponse : {noResponse}</Badge>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <p className="text-xs text-ink-3">Période :</p>
        <div className="inline-flex gap-1 rounded-[10px] bg-[#E4E9F2] p-1">
          {([7, 30, 90] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              className={cn(
                'rounded-[7px] px-2.5 py-1 text-xs font-semibold transition-colors',
                period === p ? 'bg-brand text-white shadow-sm' : 'text-ink-2 hover:text-ink'
              )}
            >
              {p} j
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
