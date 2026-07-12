'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, Skill, SkillCategory } from '@/lib/types';
import { usePermissions } from '@/lib/permissions/permissions-context';
import { getSkillColorClass } from '@/components/skills/skill-badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

type CategoryWithSkills = SkillCategory & { skills: Skill[] };
type SkillRef = { id: string; name: string; category_id: string | null; display_order: number };

type VolunteerSkillRow = { skill_id: string; skill: SkillRef | SkillRef[] | null };

type VolunteerProfile = Pick<
  Profile,
  'id' | 'full_name' | 'identifier' | 'role' | 'slack_user_id' | 'slack_team_id' | 'slack_username' | 'slack_connected_at' | 'avatar_url'
> & {
  profile_skills: VolunteerSkillRow[] | null;
};

type InvitationRow = {
  slack_user_id: string;
  slack_team_id: string;
  slack_email: string | null;
  slack_name: string | null;
  status: string;
  matched_profile_id: string | null;
};

type SlackDirectoryEntry = {
  slack_user_id: string;
  slack_team_id: string;
  slack_email: string | null;
  slack_name: string | null;
  slack_username: string | null;
  matched_profile_id: string | null;
  timeline_status: string;
  avatar_url: string | null;
  invitation_id: string | null;
  invitation_status: string | null;
};

// 'new'     : aucun compte Timeline pour ce membre Slack — action « Créer un compte » (pas de message envoyé).
// 'created' : compte créé (via création directe ou ajout de compétences) mais jamais contacté.
// 'sent'    : des identifiants (mot de passe temporaire) ont déjà été envoyés au moins une fois par Slack.
type AccountStatus = 'new' | 'created' | 'sent';

type UnifiedRow = {
  key: string;
  profileId: string | null;
  // Profil Timeline existant repéré par correspondance d'email (pas encore lié à ce membre Slack) —
  // à lier plutôt qu'à recréer lors de la création de compte / de l'envoi des identifiants.
  matchedProfileId: string | null;
  slackUserId: string | null;
  slackTeamId: string | null;
  slackEmail: string | null;
  slackName: string | null;
  slackUsername: string | null;
  pseudo: string;
  // Identifiant de connexion (profiles.identifier) — distinct du pseudo Slack affiché,
  // modifiable par l'admin car les pseudos Slack dérivés sont parfois peu lisibles.
  identifier: string | null;
  avatarUrl: string | null;
  accountStatus: AccountStatus;
  skills: SkillRef[];
};

type VolunteersPageClientProps = {
  edited: boolean;
};

const STATUS_META: Record<AccountStatus, { label: string; className: string }> = {
  sent: { label: 'Identifiants envoyés', className: 'border-ok-line bg-ok-soft text-ok-text' },
  created: { label: 'Compte créé', className: 'border-warn-line bg-warn-soft text-warn-text' },
  new: { label: 'Nouveau', className: 'border-line bg-surface-sub text-ink-2' }
};

const STATUS_SEGMENTS: Array<{ key: 'all' | AccountStatus; label: string }> = [
  { key: 'all', label: 'Total Slack' },
  { key: 'sent', label: 'Identifiants envoyés' },
  { key: 'created', label: 'Comptes créés' },
  { key: 'new', label: 'Nouveaux' }
];

function rowInitials(value: string): string {
  const cleaned = value.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return (cleaned.slice(0, 2) || '?').toUpperCase();
}

export function VolunteersPageClient({ edited }: VolunteersPageClientProps) {
  const { loading: permissionsLoading, can } = usePermissions();
  const canManage = can('volunteer', 'can_manage');
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [slackDirectory, setSlackDirectory] = useState<SlackDirectoryEntry[] | null>(null);
  const [categories, setCategories] = useState<CategoryWithSkills[]>([]);
  const [selectedSkillByCategory, setSelectedSkillByCategory] = useState<Record<string, string | null>>({});
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Filtres par compétence repliés par défaut : ils prennent beaucoup de place sous la barre de recherche.
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [busyRowKey, setBusyRowKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingRow, setEditingRow] = useState<UnifiedRow | null>(null);
  const [draftSkillIds, setDraftSkillIds] = useState<string[]>([]);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [linkingRow, setLinkingRow] = useState<UnifiedRow | null>(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkBusyKey, setLinkBusyKey] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [identifierRow, setIdentifierRow] = useState<UnifiedRow | null>(null);
  const [draftIdentifier, setDraftIdentifier] = useState('');
  const [identifierSaving, setIdentifierSaving] = useState(false);
  const [identifierError, setIdentifierError] = useState<string | null>(null);

  const router = useRouter();

  const loadVolunteers = useCallback(async () => {
    const [volunteersRes, invitationsRes, categoriesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id,full_name,identifier,role,slack_user_id,slack_team_id,slack_username,slack_connected_at,avatar_url,profile_skills(skill_id,skill:skills(id,name,category_id,display_order))'
        )
        .eq('role', 'benevole')
        .order('full_name', { ascending: true }),
      supabase
        .from('slack_invitations')
        .select('slack_user_id,slack_team_id,slack_email,slack_name,status,matched_profile_id'),
      supabase
        .from('skill_categories')
        .select('id,name,color,display_order,created_at,skills(id,name,display_order,category_id,created_at)')
        .order('display_order', { ascending: true })
        .order('display_order', { referencedTable: 'skills', ascending: true })
    ]);

    if (volunteersRes.error) { setError(volunteersRes.error.message); return; }
    if (categoriesRes.error) { setError(categoriesRes.error.message); return; }

    setVolunteers((volunteersRes.data ?? []) as VolunteerProfile[]);
    setInvitations((invitationsRes.data ?? []) as InvitationRow[]);
    setCategories((categoriesRes.data ?? []) as CategoryWithSkills[]);
  }, []);

  const runSync = useCallback(async (): Promise<boolean> => {
    setSyncing(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/admin/slack/sync', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } });
      const p = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(p.error ?? p.message ?? `Échec de la synchronisation Slack (HTTP ${r.status}).`);
        return false;
      }
      setSlackDirectory((p.results ?? []) as SlackDirectoryEntry[]);
      return true;
    } catch {
      setError('Impossible de synchroniser les membres Slack pour le moment.');
      return false;
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (permissionsLoading) return;

    async function init() {
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      if (!canManage) { setLoading(false); return; }

      await loadVolunteers();
      setLoading(false);
      void runSync();
    }

    void init();
  }, [router, loadVolunteers, runSync, permissionsLoading, canManage]);

  const volunteersWithSkills = useMemo(() =>
    volunteers.map((volunteer) => {
      const skills = (volunteer.profile_skills ?? [])
        .map((ps) => {
          const s = Array.isArray(ps.skill) ? ps.skill[0] : ps.skill;
          if (!s) return null;
          return { id: s.id, name: s.name, category_id: s.category_id, display_order: s.display_order };
        })
        .filter((s): s is SkillRef => s !== null);
      return { volunteer, skills };
    }),
    [volunteers]
  );

  const sentProfileIds = useMemo(
    () =>
      new Set(
        invitations
          .filter((i) => (i.status === 'sent' || i.status === 'accepted') && i.matched_profile_id)
          .map((i) => i.matched_profile_id as string)
      ),
    [invitations]
  );
  const unmatchedInvitations = useMemo(() => invitations.filter((i) => !i.matched_profile_id), [invitations]);

  const rows = useMemo<UnifiedRow[]>(() => {
    const byProfileId = new Map<string, UnifiedRow>();

    for (const { volunteer, skills } of volunteersWithSkills) {
      byProfileId.set(volunteer.id, {
        key: volunteer.id,
        profileId: volunteer.id,
        matchedProfileId: null,
        slackUserId: volunteer.slack_user_id ?? null,
        slackTeamId: volunteer.slack_team_id ?? null,
        slackEmail: null,
        slackName: volunteer.full_name ?? null,
        slackUsername: volunteer.slack_username ?? null,
        pseudo: volunteer.slack_username || volunteer.identifier || volunteer.full_name || volunteer.id,
        identifier: volunteer.identifier ?? null,
        avatarUrl: volunteer.avatar_url ?? null,
        accountStatus: sentProfileIds.has(volunteer.id) ? 'sent' : 'created',
        skills
      });
    }

    const extra: UnifiedRow[] = [];

    if (slackDirectory) {
      for (const entry of slackDirectory) {
        if (entry.timeline_status === 'linked') {
          if (entry.matched_profile_id) {
            const row = byProfileId.get(entry.matched_profile_id);
            if (row) {
              row.avatarUrl = entry.avatar_url ?? row.avatarUrl;
              row.slackName = entry.slack_name ?? row.slackName;
              row.pseudo = entry.slack_username || row.pseudo;
              row.slackUsername = entry.slack_username ?? row.slackUsername;
              row.slackUserId = entry.slack_user_id;
              row.slackTeamId = entry.slack_team_id;
              if (entry.invitation_status === 'sent' || entry.invitation_status === 'accepted') row.accountStatus = 'sent';
            }
          }
          continue;
        }

        // Membre Slack sans profil Timeline lié : jamais de statut 'sent' possible ici
        // puisque l'envoi crée systématiquement le compte (cf. send-slack-invitations).
        // `matched_profile_id` peut pointer un profil Timeline existant (même email, jamais
        // lié à Slack) : la création/l'envoi doivent alors le lier plutôt qu'en recréer un.
        extra.push({
          key: `slack:${entry.slack_team_id}:${entry.slack_user_id}`,
          profileId: null,
          matchedProfileId: entry.timeline_status === 'timeline_account_unlinked' ? entry.matched_profile_id : null,
          slackUserId: entry.slack_user_id,
          slackTeamId: entry.slack_team_id,
          slackEmail: entry.slack_email,
          slackName: entry.slack_name,
          slackUsername: entry.slack_username,
          pseudo: entry.slack_username || entry.slack_name || entry.slack_user_id,
          identifier: null,
          avatarUrl: entry.avatar_url,
          accountStatus: 'new',
          skills: []
        });
      }
    } else {
      for (const inv of unmatchedInvitations) {
        extra.push({
          key: `slack:${inv.slack_team_id}:${inv.slack_user_id}`,
          profileId: null,
          matchedProfileId: inv.matched_profile_id,
          slackUserId: inv.slack_user_id,
          slackTeamId: inv.slack_team_id,
          slackEmail: inv.slack_email,
          slackName: inv.slack_name,
          slackUsername: null,
          pseudo: inv.slack_name || inv.slack_user_id,
          identifier: null,
          avatarUrl: null,
          accountStatus: 'new',
          skills: []
        });
      }
    }

    return [...byProfileId.values(), ...extra];
  }, [volunteersWithSkills, slackDirectory, unmatchedInvitations, sentProfileIds]);

  const skillCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const skill of row.skills) {
        counts.set(skill.id, (counts.get(skill.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [rows]);

  const statusCounts = useMemo(() => {
    const counts: Record<'all' | AccountStatus, number> = { all: rows.length, sent: 0, created: 0, new: 0 };
    for (const row of rows) counts[row.accountStatus] += 1;
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = searchQuery.trim().toLocaleLowerCase('fr').replace(/^@/, '');

    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.accountStatus !== statusFilter) return false;

      for (const [categoryId, selectedSkillId] of Object.entries(selectedSkillByCategory)) {
        if (!selectedSkillId) continue;
        const category = categories.find((c) => c.id === categoryId);
        const selectedSkill = category?.skills.find((s) => s.id === selectedSkillId);
        if (!selectedSkill) continue;
        // Les compétences d'une catégorie sont des paliers ordonnés (cf. mission eligibility) :
        // un niveau supérieur satisfait aussi un filtre sur un niveau inférieur.
        const passes = row.skills.some(
          (s) => s.category_id === categoryId && s.display_order >= selectedSkill.display_order
        );
        if (!passes) return false;
      }

      if (term.length === 0) return true;
      const haystack = [row.pseudo, ...row.skills.map((s) => s.name)].join(' ').toLocaleLowerCase('fr');
      return haystack.includes(term);
    });
  }, [rows, statusFilter, selectedSkillByCategory, searchQuery, categories]);

  const toggleSkillFilter = (categoryId: string, skillId: string | null) => {
    setSelectedSkillByCategory((current) => ({
      ...current,
      [categoryId]: current[categoryId] === skillId ? null : skillId
    }));
  };

  const handleSync = async () => {
    await runSync();
  };

  // Met à jour localement l'entrée de l'annuaire Slack déjà chargée (sans relancer un sync live)
  // pour qu'un membre nouvellement lié ne réapparaisse pas comme "Nouveau" jusqu'au prochain sync.
  const markSlackDirectoryLinked = (slackUserId: string | null, slackTeamId: string | null, profileId: string) => {
    if (!slackUserId || !slackTeamId) return;
    setSlackDirectory((prev) =>
      prev
        ? prev.map((entry) =>
            entry.slack_user_id === slackUserId && entry.slack_team_id === slackTeamId
              ? { ...entry, timeline_status: 'linked', matched_profile_id: profileId }
              : entry
          )
        : prev
    );
  };

  const rowToTarget = (row: UnifiedRow) => ({
    slack_user_id: row.slackUserId,
    slack_team_id: row.slackTeamId,
    slack_name: row.slackName,
    slack_email: row.slackEmail,
    slack_username: row.slackUsername,
    matched_profile_id: row.matchedProfileId
  });

  const sendInvitations = async (targets: ReturnType<typeof rowToTarget>[]) => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/admin/slack/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ targets })
      });
      const p = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(p.error ?? p.message ?? `Échec de l'envoi des identifiants (HTTP ${r.status}).`);
        return;
      }
      const results = (p.results ?? []) as Array<{ slack_user_id?: string; ok?: boolean; error?: string; profile_id?: string }>;
      const failures = results.filter((res) => res.ok === false);
      if (failures.length > 0) {
        setError(`${failures.length} envoi(s) ont échoué : ${failures.map((f) => f.error).join(' · ')}`);
      }
      results.forEach((res, i) => {
        if (res.ok && res.profile_id) markSlackDirectoryLinked(targets[i]?.slack_user_id ?? null, targets[i]?.slack_team_id ?? null, res.profile_id);
      });
      await loadVolunteers();
    } catch {
      setError("Impossible d'envoyer les identifiants pour le moment.");
    }
  };

  const inviteAllNew = async () => {
    const targets = rows.filter((r) => r.accountStatus !== 'sent' && r.slackUserId).map(rowToTarget);
    if (targets.length === 0) return;
    setInviting(true);
    await sendInvitations(targets);
    setInviting(false);
  };

  const inviteOne = async (row: UnifiedRow) => {
    setBusyRowKey(row.key);
    await sendInvitations([rowToTarget(row)]);
    setBusyRowKey(null);
  };

  // Crée le profil Timeline lié à ce membre Slack, sans envoyer aucun message —
  // l'envoi des identifiants est une action distincte et volontaire.
  const provisionAccount = async (row: UnifiedRow, token: string): Promise<{ profileId: string } | { error: string }> => {
    const linkResp = await fetch('/api/admin/slack/link-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        slack_user_id: row.slackUserId,
        slack_team_id: row.slackTeamId,
        slack_name: row.slackName,
        slack_email: row.slackEmail,
        slack_username: row.slackUsername,
        profile_id: row.matchedProfileId ?? undefined
      })
    });
    const linkPayload = await linkResp.json().catch(() => ({}));
    if (!linkResp.ok) {
      return { error: linkPayload.error ?? 'Impossible de créer le profil pour ce bénévole.' };
    }
    markSlackDirectoryLinked(row.slackUserId, row.slackTeamId, linkPayload.profile_id);
    return { profileId: linkPayload.profile_id };
  };

  const createAccount = async (row: UnifiedRow) => {
    setBusyRowKey(row.key);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError('Session invalide.'); return; }
      const result = await provisionAccount(row, token);
      if ('error' in result) { setError(result.error); return; }
      await loadVolunteers();
    } catch {
      setError('Impossible de créer le compte pour le moment.');
    } finally {
      setBusyRowKey(null);
    }
  };

  const deleteAccount = async (row: UnifiedRow) => {
    if (!row.profileId) return;
    if (!window.confirm(`Supprimer le compte @${row.pseudo} ? Cette action est irréversible.`)) return;

    setBusyRowKey(row.key);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError('Session invalide.'); return; }

      const resp = await fetch(`/api/admin/volunteers/${row.profileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(payload.error ?? 'Impossible de supprimer ce bénévole.');
        return;
      }
      await loadVolunteers();
    } catch {
      setError('Impossible de supprimer ce bénévole pour le moment.');
    } finally {
      setBusyRowKey(null);
    }
  };

  // Membres Slack pas encore rattachés à un profil Timeline — candidats pour la liaison manuelle.
  const unassignedSlackRows = useMemo(() => rows.filter((r) => r.accountStatus === 'new'), [rows]);

  const filteredUnassignedSlackRows = useMemo(() => {
    const term = linkQuery.trim().toLocaleLowerCase('fr').replace(/^@/, '');
    if (term.length === 0) return unassignedSlackRows;
    return unassignedSlackRows.filter((r) => r.pseudo.toLocaleLowerCase('fr').includes(term));
  }, [unassignedSlackRows, linkQuery]);

  const openLinkPicker = (row: UnifiedRow) => {
    setLinkingRow(row);
    setLinkQuery('');
    setLinkError(null);
  };

  const closeLinkPicker = () => {
    setLinkingRow(null);
    setLinkQuery('');
    setLinkError(null);
  };

  const confirmLink = async (candidate: UnifiedRow) => {
    if (!linkingRow?.profileId) return;
    setLinkBusyKey(candidate.key);
    setLinkError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setLinkError('Session invalide.'); return; }

      const resp = await fetch('/api/admin/slack/link-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          slack_user_id: candidate.slackUserId,
          slack_team_id: candidate.slackTeamId,
          slack_name: candidate.slackName,
          slack_email: candidate.slackEmail,
          slack_username: candidate.slackUsername,
          profile_id: linkingRow.profileId
        })
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setLinkError(payload.error ?? 'Impossible de lier ce compte Slack.');
        return;
      }
      markSlackDirectoryLinked(candidate.slackUserId, candidate.slackTeamId, linkingRow.profileId);
      closeLinkPicker();
      await loadVolunteers();
    } catch {
      setLinkError('Impossible de lier ce compte Slack pour le moment.');
    } finally {
      setLinkBusyKey(null);
    }
  };

  const openIdentifierEditor = (row: UnifiedRow) => {
    setIdentifierRow(row);
    setDraftIdentifier(row.identifier ?? '');
    setIdentifierError(null);
  };

  const closeIdentifierEditor = () => {
    setIdentifierRow(null);
    setDraftIdentifier('');
    setIdentifierError(null);
  };

  const saveIdentifier = async () => {
    if (!identifierRow?.profileId) return;
    const value = draftIdentifier.trim().toLowerCase();
    if (!value) { setIdentifierError("L'identifiant est obligatoire."); return; }
    if (!/^[a-z0-9._-]+$/.test(value)) {
      setIdentifierError("L'identifiant ne peut contenir que des lettres minuscules, chiffres, points, tirets et underscores.");
      return;
    }

    setIdentifierSaving(true);
    setIdentifierError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setIdentifierError('Session invalide.'); setIdentifierSaving(false); return; }

      const resp = await fetch(`/api/admin/volunteers/${identifierRow.profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ identifier: value })
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const message = payload.error ?? "Impossible de modifier l'identifiant.";
        setIdentifierError(/duplicate|unique/i.test(message) ? 'Cet identifiant est déjà utilisé.' : message);
        return;
      }
      closeIdentifierEditor();
      await loadVolunteers();
    } catch {
      setIdentifierError("Impossible de modifier l'identifiant pour le moment.");
    } finally {
      setIdentifierSaving(false);
    }
  };

  const openEditor = (row: UnifiedRow) => {
    setEditingRow(row);
    setDraftSkillIds(row.skills.map((s) => s.id));
    setModalError(null);
  };

  const closeModal = () => {
    setEditingRow(null);
    setDraftSkillIds([]);
    setModalError(null);
  };

  const toggleDraftSkill = (skillId: string) => {
    setDraftSkillIds((current) => (current.includes(skillId) ? current.filter((id) => id !== skillId) : [...current, skillId]));
  };

  const clearDraftCategory = (categoryId: string) => {
    const idsInCategory = new Set(
      (categories.find((c) => c.id === categoryId)?.skills ?? []).map((s) => s.id)
    );
    setDraftSkillIds((current) => current.filter((id) => !idsInCategory.has(id)));
  };

  const saveModal = async () => {
    if (!editingRow) return;
    setModalSaving(true);
    setModalError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setModalError('Session invalide.'); setModalSaving(false); return; }

      let targetProfileId = editingRow.profileId;

      if (!targetProfileId) {
        const result = await provisionAccount(editingRow, token);
        if ('error' in result) {
          setModalError(result.error);
          setModalSaving(false);
          return;
        }
        targetProfileId = result.profileId;
      }

      const skillsResp = await fetch(`/api/admin/volunteers/${targetProfileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ skill_ids: draftSkillIds })
      });
      const skillsPayload = await skillsResp.json().catch(() => ({}));
      if (!skillsResp.ok) {
        setModalError(skillsPayload.error ?? "Impossible d'enregistrer les compétences.");
        setModalSaving(false);
        return;
      }

      closeModal();
      await loadVolunteers();
    } catch {
      setModalError("Impossible d'enregistrer les compétences pour le moment.");
    } finally {
      setModalSaving(false);
    }
  };

  if (loading || permissionsLoading) return <p className="text-sm text-ink-2">Chargement des bénévoles...</p>;
  if (!canManage) return <p className="text-sm text-bad">{error ?? 'Accès refusé : vous n’avez pas la permission de gérer les bénévoles.'}</p>;

  const hasPendingMembers = statusCounts.new + statusCounts.created > 0;
  const activeSkillFilterCount = Object.values(selectedSkillByCategory).filter(Boolean).length;
  const hasSkillCategories = categories.some((category) => category.skills.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bénévoles"
        subtitle={`${filteredRows.length} bénévole(s) affiché(s) sur ${rows.length} membres Slack.`}
        actions={
          <a
            href="/admin/slack/messages"
            className="inline-flex items-center gap-1.5 rounded-[11px] border border-line-field bg-surface-card px-3 py-2 text-sm font-bold text-ink-2 hover:bg-surface-sub"
          >
            Gérer les messages par défaut →
          </a>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleSync} disabled={syncing} icon="sync">
          {syncing ? 'Synchronisation en cours…' : 'Synchroniser Slack'}
        </Button>
        <Button variant="engage" onClick={inviteAllNew} disabled={inviting || !hasPendingMembers}>
          {inviting ? 'Envoi en cours…' : 'Envoyer les identifiants aux nouveaux'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
        {STATUS_SEGMENTS.map((seg, i) => (
          <span key={seg.key} className="flex items-center gap-2">
            {i > 0 ? <span className="text-ink-4">·</span> : null}
            <button
              type="button"
              onClick={() => setStatusFilter(seg.key)}
              className={cn('font-medium', statusFilter === seg.key ? 'font-extrabold text-ink' : 'text-ink-2')}
            >
              {seg.label}: {statusCounts[seg.key]}
            </button>
          </span>
        ))}
      </div>

      {edited ? (
        <div className="rounded-[11px] border border-ok-line bg-ok-soft p-3 text-sm text-ok-text">
          Le bénévole a été modifié avec succès.
        </div>
      ) : null}
      {error ? <div className="rounded-[11px] border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}

      <Card className="p-4">
        <div className="space-y-4">
          <label className="relative block" htmlFor="volunteer-search">
            <Icon name="search" size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              id="volunteer-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Pseudo Slack ou compétence"
              className="w-full rounded-full border border-line-field bg-surface-sub py-2 pl-11 pr-4 text-sm text-ink placeholder:text-ink-3 focus:border-accent-ring focus:bg-surface-card focus:outline-none"
            />
          </label>

          {hasSkillCategories && (
            <div className="border-t border-line-row pt-3">
              <button
                type="button"
                onClick={() => setFiltersExpanded((current) => !current)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={filtersExpanded}
              >
                <span className="flex items-center gap-2">
                  <Icon name="tune" size={18} className="text-ink-2" />
                  <span className="text-sm font-bold text-ink">Filtres par compétence</span>
                  {activeSkillFilterCount > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
                      {activeSkillFilterCount}
                    </span>
                  ) : null}
                </span>
                <Icon
                  name="expand_more"
                  size={18}
                  className={cn('shrink-0 text-ink-3 transition-transform', filtersExpanded && 'rotate-180')}
                />
              </button>

              {filtersExpanded ? (
                <div className="mt-3 space-y-3">
                  {categories.map((category) => {
                    if (category.skills.length === 0) return null;
                    const selectedSkillId = selectedSkillByCategory[category.id] ?? null;

                    return (
                      <div key={category.id} className="space-y-1">
                        <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">{category.name}</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => toggleSkillFilter(category.id, null)}
                            className={cn(
                              'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium transition hover:opacity-80',
                              !selectedSkillId ? getSkillColorClass(category.color) : 'border-line bg-surface-sub text-ink-2'
                            )}
                          >
                            Toutes
                          </button>
                          {category.skills.map((skill) => {
                            const isSelected = selectedSkillId === skill.id;
                            const count = skillCounts.get(skill.id) ?? 0;
                            return (
                              <button
                                key={skill.id}
                                type="button"
                                onClick={() => toggleSkillFilter(category.id, skill.id)}
                                className={cn(
                                  'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium transition hover:opacity-80',
                                  isSelected ? getSkillColorClass(category.color) : 'border-line bg-surface-sub text-ink-2'
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
              ) : null}
            </div>
          )}
        </div>
      </Card>

      {filteredRows.length === 0 ? (
        <Card className="border-dashed p-6 text-sm text-ink-2">Aucun bénévole ne correspond à ces filtres.</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-sub text-left">
              <tr className="border-b border-line-row">
                <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">Bénévole</th>
                <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">Compte</th>
                <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">Compétences</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-row">
              {filteredRows.map((row) => {
                const meta = STATUS_META[row.accountStatus];
                const isBusy = busyRowKey === row.key;
                return (
                  <tr key={row.key}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2.5">
                        {row.avatarUrl ? (
                          <img src={row.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E4E8F0] text-[13px] font-semibold text-ink-2">
                            {rowInitials(row.pseudo)}
                          </span>
                        )}
                        <div>
                          <span className="font-mono text-[15px] font-bold text-ink">@{row.pseudo}</span>
                          {row.profileId ? (
                            <button
                              type="button"
                              onClick={() => openIdentifierEditor(row)}
                              className="ml-2 text-xs font-medium text-ink-3 underline hover:text-ink-2"
                              title="Modifier l'identifiant de connexion"
                            >
                              {row.identifier ?? '—'} ✎
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={cn('inline-flex rounded-full border px-3 py-1 text-xs font-bold', meta.className)}>{meta.label}</span>
                      {row.accountStatus === 'new' ? (
                        <button
                          type="button"
                          onClick={() => createAccount(row)}
                          disabled={isBusy}
                          className="mt-1.5 block text-xs font-bold text-brand underline disabled:opacity-50"
                        >
                          {isBusy ? '…' : row.matchedProfileId ? 'Lier au compte existant' : 'Créer un compte'}
                        </button>
                      ) : row.slackUserId ? (
                        <button
                          type="button"
                          onClick={() => inviteOne(row)}
                          disabled={isBusy}
                          className="mt-1.5 block text-xs font-bold text-brand underline disabled:opacity-50"
                        >
                          {isBusy ? 'Envoi…' : row.accountStatus === 'created' ? 'Envoyer les identifiants' : 'Renvoyer les identifiants'}
                        </button>
                      ) : (
                        <>
                          <span className="mt-1.5 block text-xs text-ink-3">Compte non lié à Slack</span>
                          <button
                            type="button"
                            onClick={() => openLinkPicker(row)}
                            className="mt-1 block text-xs font-bold text-brand underline"
                          >
                            Lier un compte Slack
                          </button>
                        </>
                      )}
                      {row.profileId ? (
                        <button
                          type="button"
                          onClick={() => deleteAccount(row)}
                          disabled={isBusy}
                          className="mt-1.5 block text-xs font-bold text-bad underline disabled:opacity-50"
                        >
                          Supprimer
                        </button>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {row.skills.map((skill) => {
                          const cat = categories.find((c) => c.id === skill.category_id);
                          return (
                            <span key={skill.id} className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-bold', getSkillColorClass(cat?.color))}>
                              {skill.name}
                            </span>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => openEditor(row)}
                          className="inline-flex rounded-full border border-dashed border-line-field px-2 py-0.5 text-xs font-bold text-ink-2 hover:border-ink-3 hover:text-ink"
                        >
                          + Ajouter
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {editingRow ? (
        <Modal
          title={`Compétences — @${editingRow.pseudo}`}
          onClose={closeModal}
          footer={
            <>
              <Button variant="ghost" onClick={closeModal} disabled={modalSaving}>Annuler</Button>
              <Button onClick={saveModal} disabled={modalSaving}>{modalSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-2">
              L&apos;identité (pseudo, nom, photo) vient de Slack ; ajoutez ici les compétences spécifiques à l&apos;outil.
            </p>
            {modalError ? <div className="rounded-md border border-bad/30 bg-bad-soft p-2 text-xs text-bad">{modalError}</div> : null}
            {categories.length === 0 ? (
              <p className="text-xs text-ink-3">Aucune catégorie de compétences définie.</p>
            ) : (
              categories.map((category) => {
                if (category.skills.length === 0) return null;
                const hasSelection = category.skills.some((s) => draftSkillIds.includes(s.id));
                return (
                  <div key={category.id} className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-3">{category.name}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => clearDraftCategory(category.id)}
                        className={cn(
                          'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium transition hover:opacity-80',
                          !hasSelection ? getSkillColorClass(category.color) : 'border-line bg-surface-sub text-ink-2'
                        )}
                      >
                        Aucune
                      </button>
                      {category.skills.map((skill) => {
                        const active = draftSkillIds.includes(skill.id);
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() => toggleDraftSkill(skill.id)}
                            className={cn(
                              'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium transition hover:opacity-80',
                              active ? getSkillColorClass(category.color) : 'border-line bg-surface-sub text-ink-2'
                            )}
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
        </Modal>
      ) : null}

      {linkingRow ? (
        <Modal title={`Lier @${linkingRow.pseudo} à un compte Slack`} onClose={closeLinkPicker}>
          <div className="space-y-3">
            <p className="text-sm text-ink-2">
              Choisissez le membre Slack correspondant parmi ceux qui ne sont pas encore rattachés à un profil Timeline.
            </p>
            {linkError ? <div className="rounded-md border border-bad/30 bg-bad-soft p-2 text-xs text-bad">{linkError}</div> : null}
            <input
              type="search"
              value={linkQuery}
              onChange={(event) => setLinkQuery(event.target.value)}
              placeholder="Rechercher un pseudo Slack"
              autoFocus
              className="w-full rounded-full border border-line-field bg-surface-sub px-4 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent-ring focus:bg-surface-card focus:outline-none"
            />
            <div className="max-h-72 divide-y divide-line-row overflow-y-auto rounded-[11px] border border-line">
              {filteredUnassignedSlackRows.length === 0 ? (
                <p className="p-3 text-sm text-ink-3">Aucun membre Slack non attribué ne correspond.</p>
              ) : (
                filteredUnassignedSlackRows.map((candidate) => (
                  <button
                    key={candidate.key}
                    type="button"
                    onClick={() => confirmLink(candidate)}
                    disabled={linkBusyKey !== null}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-sub disabled:opacity-50"
                  >
                    {candidate.avatarUrl ? (
                      <img src={candidate.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E4E8F0] text-[11px] font-semibold text-ink-2">
                        {rowInitials(candidate.pseudo)}
                      </span>
                    )}
                    <span className="font-mono text-sm font-bold text-ink">@{candidate.pseudo}</span>
                    {linkBusyKey === candidate.key ? <span className="ml-auto text-xs text-ink-3">Liaison…</span> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </Modal>
      ) : null}

      {identifierRow ? (
        <Modal
          title={`Identifiant — @${identifierRow.pseudo}`}
          onClose={closeIdentifierEditor}
          footer={
            <>
              <Button variant="ghost" onClick={closeIdentifierEditor} disabled={identifierSaving}>Annuler</Button>
              <Button onClick={saveIdentifier} disabled={identifierSaving}>{identifierSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-ink-2">
              Identifiant de connexion utilisé pour se connecter à Timeline — distinct du pseudo Slack affiché ci-dessus.
            </p>
            {identifierError ? <div className="rounded-md border border-bad/30 bg-bad-soft p-2 text-xs text-bad">{identifierError}</div> : null}
            <input
              type="text"
              value={draftIdentifier}
              onChange={(event) => setDraftIdentifier(event.target.value)}
              placeholder="prenom.nom"
              autoFocus
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              disabled={identifierSaving}
              className="w-full rounded-[10px] border border-line-field px-3 py-2 text-sm text-ink focus:border-accent-ring focus:outline-none"
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
