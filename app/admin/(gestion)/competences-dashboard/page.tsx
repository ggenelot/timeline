'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { RoleBehavior } from '@/lib/types';

// ── Données renvoyées par l'API ───────────────────────────────

type ApiSkill = {
  id: string;
  name: string;
  code: string | null;
  level: number | null;
  category_id: string | null;
  display_order: number;
};

type ApiCategory = {
  id: string;
  name: string;
  color: string;
  display_order: number;
  skills: ApiSkill[];
};

type ApiProfile = {
  id: string;
  full_name: string | null;
  email: string;
  sector: string | null;
  role: string;
};

type ApiProfileSkill = {
  profile_id: string;
  skill_id: string;
  status: string;
};

type ApiStatus = {
  id: string;
  key: string;
  label: string;
  color: string;
  mark: string;
  is_validating: boolean;
  protected: boolean;
  display_order: number;
};

type CursusRef = { id: string; code: string; name: string };

type ApiCursus = { id: string; code: string; name: string; category: string | null; level: number | null; skill_id: string | null };

type ApiEnrolledCursus = { profile_id: string; cursus_id: string; completed_at: string | null };

type ApiCompetenceEvent = {
  id: string;
  profile_id: string;
  cursus_id: string;
  volunteer_cursus_id: string;
  competence_id: string;
  competence_name: string;
  phase_name: string | null;
  doublure_id: string | null;
  event_name: string | null;
  event_date: string | null;
  event_lieu: string | null;
  supervisor_name: string | null;
  supervisor_antenne: string | null;
  message: string | null;
  supervisor_comment: string | null;
  is_external: boolean;
  is_pending: boolean;
  validated_at: string;
};

type DashboardData = {
  categories: ApiCategory[];
  profiles: ApiProfile[];
  profileSkills: ApiProfileSkill[];
  cursusBySkill: Record<string, CursusRef>;
  allCursus: ApiCursus[];
  enrolledCursus: ApiEnrolledCursus[];
  statuses: ApiStatus[];
  competenceEvents: ApiCompetenceEvent[];
};

// ── Palette des catégories (couleur nommée → accents) ─────────
// Réutilisée aussi pour les statuts : ils partagent la même palette de
// couleurs nommées, configurable depuis la page « Compétences ».

const CATEGORY_PALETTE: Record<string, { accent: string; soft: string; softBorder: string }> = {
  slate: { accent: '#5B6478', soft: '#F4F6FA', softBorder: '#E5E9F0' },
  amber: { accent: '#B4590F', soft: '#FFF3E9', softBorder: '#FBD9BE' },
  orange: { accent: '#B4590F', soft: '#FFF3E9', softBorder: '#FBD9BE' },
  sky: { accent: '#1E3C87', soft: '#EEF4FE', softBorder: '#CFDDF6' },
  blue: { accent: '#1E3C87', soft: '#EEF4FE', softBorder: '#CFDDF6' },
  indigo: { accent: '#1E3C87', soft: '#EEF4FE', softBorder: '#CFDDF6' },
  emerald: { accent: '#0B6E63', soft: '#E9F7F4', softBorder: '#C7E9E3' },
  teal: { accent: '#0B6E63', soft: '#E9F7F4', softBorder: '#C7E9E3' },
  cyan: { accent: '#0B6E63', soft: '#E9F7F4', softBorder: '#C7E9E3' },
  green: { accent: '#0B6E63', soft: '#E9F7F4', softBorder: '#C7E9E3' },
  violet: { accent: '#7A2E86', soft: '#F5EDFA', softBorder: '#E3D6EF' },
  pink: { accent: '#8E1279', soft: '#F8E6F4', softBorder: '#E9C9E4' },
  rose: { accent: '#D14343', soft: '#FDEAEA', softBorder: '#F5C6C6' },
  red: { accent: '#D14343', soft: '#FDEAEA', softBorder: '#F5C6C6' },
};

function palette(color: string) {
  return CATEGORY_PALETTE[color] ?? CATEGORY_PALETTE.slate;
}

// ── Helpers ───────────────────────────────────────────────────

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type EditorState = {
  profileId: string;
  skillId: string;
  skillCode: string;
  skillName: string;
  profileName: string;
  current: string | null;
  x: number;
  y: number;
};

// ── Page ──────────────────────────────────────────────────────

export default function CompetencesDashboardPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  const [catId, setCatId] = useState<string | null>(null);
  const [view, setView] = useState<'arbre' | 'tableau' | 'chronologie'>('arbre');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [query, setQuery] = useState('');
  const [expandedSkillIds, setExpandedSkillIds] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);

  // ── Chronologie des montées en compétence ────────────────────
  const [chronoProfileId, setChronoProfileId] = useState<'all' | string>('all');
  const [chronoCursusId, setChronoCursusId] = useState<'all' | string>('all');
  const [chronoQuery, setChronoQuery] = useState('');
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());

  // Statuts effectifs, clé `${profileId}|${skillId}` → statut brut.
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});

  // ── Création d'un cahier de doublure depuis la flèche d'un badge ─────
  const [createCursusTarget, setCreateCursusTarget] = useState<{
    pid: string;
    name: string;
    cursus: CursusRef;
    x: number;
    y: number;
  } | null>(null);
  const [createCursusSubmitting, setCreateCursusSubmitting] = useState(false);
  const [createCursusError, setCreateCursusError] = useState<string | null>(null);

  // ── Accès + chargement ──────────────────────────────────────

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace('/login');
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const tok = sessionData.session?.access_token ?? '';
      setToken(tok);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      let ok = profileData?.role === 'admin';
      if (!ok) {
        const res = await fetch('/api/roles/mine', { headers: { Authorization: `Bearer ${tok}` } });
        if (res.ok) {
          const { behaviors } = (await res.json()) as { behaviors: RoleBehavior[] };
          ok = behaviors.some((b) => b.resource_type === 'cursus' && b.behavior_type === 'can_manage');
        }
      }
      setAllowed(ok);

      if (!ok) {
        setLoading(false);
        return;
      }

      const res = await fetch('/api/admin/competences-dashboard', {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? 'Erreur lors du chargement.');
        setLoading(false);
        return;
      }
      const json = (await res.json()) as DashboardData;
      setData(json);
      const map: Record<string, string> = {};
      for (const ps of json.profileSkills) map[`${ps.profile_id}|${ps.skill_id}`] = ps.status;
      setStatusMap(map);
      if (json.categories.length > 0) setCatId(json.categories[0].id);
      setLoading(false);
    }
    void init();
  }, [router]);

  // ── Mutation d'une cellule ──────────────────────────────────

  const setStatus = useCallback(
    async (profileId: string, skillId: string, next: string) => {
      const key = `${profileId}|${skillId}`;
      const prev = statusMap[key];
      // Optimistic UI
      setStatusMap((m) => {
        const copy = { ...m };
        if (next === 'none') delete copy[key];
        else copy[key] = next;
        return copy;
      });
      const res = await fetch('/api/admin/competences-dashboard', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, skill_id: skillId, status: next }),
      });
      if (!res.ok) {
        // Revert
        setStatusMap((m) => {
          const copy = { ...m };
          if (prev === undefined) delete copy[key];
          else copy[key] = prev;
          return copy;
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? 'Erreur lors de la mise à jour.');
      }
    },
    [statusMap, token]
  );

  // ── Dérivés ─────────────────────────────────────────────────

  const cat = useMemo(
    () => data?.categories.find((c) => c.id === catId) ?? data?.categories[0] ?? null,
    [data, catId]
  );
  const pal = cat ? palette(cat.color) : palette('slate');

  const profileById = useMemo(() => {
    const m: Record<string, ApiProfile> = {};
    for (const p of data?.profiles ?? []) m[p.id] = p;
    return m;
  }, [data]);

  const statusByKey = useMemo(() => {
    const m: Record<string, { key: string; label: string; mark: string; ring: string; soft: string; text: string; isValidating: boolean }> = {};
    for (const s of data?.statuses ?? []) {
      const p = palette(s.color);
      m[s.key] = { key: s.key, label: s.label, mark: s.mark, ring: p.accent, soft: p.soft, text: p.accent, isValidating: s.is_validating };
    }
    return m;
  }, [data]);

  // Paires profil|cursus pour lesquelles un cahier de doublure (en cours ou
  // terminé) existe déjà — sert à n'afficher la flèche vers le carnet que
  // dans ce cas, et à filtrer les cursus proposables dans la modale d'inscription.
  const enrolledCursusSet = useMemo(() => {
    const m = new Set<string>();
    for (const ec of data?.enrolledCursus ?? []) m.add(`${ec.profile_id}|${ec.cursus_id}`);
    return m;
  }, [data]);

  const q = query.trim().toLowerCase();
  const matchPerson = useCallback(
    (pid: string) => {
      if (!q) return true;
      const p = profileById[pid];
      if (!p) return false;
      return (p.full_name ?? '').toLowerCase().includes(q) || (p.sector ?? '').toLowerCase().includes(q);
    },
    [q, profileById]
  );

  // Statut explicite d'une cellule (le seul mode désormais : pas d'héritage).
  const eff = useCallback(
    (pid: string, skillId: string): string | null => {
      const raw = statusMap[`${pid}|${skillId}`];
      return raw && statusByKey[raw] ? raw : null;
    },
    [statusMap, statusByKey]
  );

  // Compteurs de la catégorie + bénévoles concernés, par statut.
  const catStats = useMemo(() => {
    const counts: Record<string, number> = {};
    const people = new Set<string>();
    if (cat && data) {
      for (const sk of cat.skills) {
        for (const p of data.profiles) {
          const st = eff(p.id, sk.id);
          if (!st) continue;
          people.add(p.id);
          counts[st] = (counts[st] ?? 0) + 1;
        }
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { counts, total, peopleCount: people.size };
  }, [cat, data, eff]);

  // Compétence la plus haute (display_order = ordre hiérarchique) par bénévole.
  const highestIdx = useMemo(() => {
    const idx: Record<string, number> = {};
    if (cat && data) {
      cat.skills.forEach((sk, i) => {
        for (const p of data.profiles) {
          if (eff(p.id, sk.id)) idx[p.id] = i;
        }
      });
    }
    return idx;
  }, [cat, data, eff]);

  const filtering = statusFilter !== 'all' || q.length > 0;

  function toggleExpanded(skillId: string) {
    setExpandedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  }

  // ── Vue arbre ───────────────────────────────────────────────

  const arbreSkills = useMemo(() => {
    if (!cat || !data) return [];
    return cat.skills
      .map((sk, i) => {
        const allHolders = data.profiles
          .map((p) => ({ pid: p.id, status: eff(p.id, sk.id) }))
          .filter((x) => x.status) as Array<{ pid: string; status: string }>;
        const totalH = allHolders.length;
        const expanded = expandedSkillIds.has(sk.id);
        // Par défaut, un bénévole n'apparaît que sous sa compétence la plus
        // haute ; le badge de comptage permet d'afficher tout le monde. Un
        // filtre de statut actif ignore cette restriction pour ne pas
        // masquer une compétence qui correspond au filtre sous prétexte
        // qu'une compétence plus haute (à un autre statut) existe aussi.
        const baseHolders =
          expanded || statusFilter !== 'all' ? allHolders : allHolders.filter((x) => highestIdx[x.pid] === i);
        const filtered = baseHolders.filter(
          (x) => matchPerson(x.pid) && (statusFilter === 'all' || x.status === statusFilter)
        );
        const holders = filtered.map(({ pid, status: st }) => {
          const p = profileById[pid];
          const ss = statusByKey[st];
          const cursusDef = data.cursusBySkill[sk.id];
          const cursusEnrolled = cursusDef ? enrolledCursusSet.has(`${pid}|${cursusDef.id}`) : false;
          return {
            pid,
            name: p?.full_name ?? p?.email ?? '—',
            sector: p?.sector ?? '',
            initials: initials(p?.full_name ?? p?.email ?? '?'),
            statusLabel: ss?.label ?? st,
            ring: ss?.ring ?? '#DCE2EC',
            avatarBg: ss?.soft ?? '#F7F9FC',
            avatarColor: ss?.text ?? '#5B6478',
            text: ss?.text ?? '#5B6478',
            cursus: cursusDef,
            cursusEnrolled,
          };
        });
        const metaBits: string[] = [];
        if (sk.level && sk.level > 0) metaBits.push(`Niveau ${sk.level}`);
        const emptyLabel =
          totalH === 0
            ? 'Personne ne détient encore cette compétence.'
            : filtering
              ? 'Aucun bénévole ne correspond au filtre.'
              : 'Tous les détenteurs ont une compétence plus haute. Cliquez sur le badge pour les afficher.';
        return {
          id: sk.id,
          code: sk.code || sk.name,
          name: sk.name,
          metaLine: metaBits.join(' · '),
          holders,
          hasHolders: holders.length > 0,
          totalH,
          expanded,
          countLabel: `${totalH} ${totalH === 1 ? 'bénévole' : 'bénévoles'}`,
          emptyLabel,
        };
      })
      .filter((sk) => {
        if (filtering) return sk.hasHolders;
        return true;
      });
  }, [cat, data, eff, highestIdx, matchPerson, statusFilter, profileById, filtering, expandedSkillIds, statusByKey, enrolledCursusSet]);

  // ── Vue tableau ─────────────────────────────────────────────

  const tableCols = useMemo(() => {
    if (!cat || !data) return [];
    return cat.skills.map((sk) => {
      const n = data.profiles.filter((p) => eff(p.id, sk.id)).length;
      return { id: sk.id, code: sk.code || sk.name, name: sk.name, count: `${n} bén.` };
    });
  }, [cat, data, eff]);

  const tableRows = useMemo(() => {
    if (!cat || !data) return [];
    return data.profiles
      .filter((p) => matchPerson(p.id))
      .map((p, idx) => ({
        pid: p.id,
        name: p.full_name ?? p.email,
        sector: p.sector ?? '',
        initials: initials(p.full_name ?? p.email),
        bg: idx % 2 === 0 ? '#FFFFFF' : '#F7F9FC',
      }));
  }, [cat, data, matchPerson]);

  // ── Chronologie des montées en compétence ────────────────────

  const cursusById = useMemo(() => {
    const m: Record<string, ApiCursus> = {};
    for (const c of data?.allCursus ?? []) m[c.id] = c;
    return m;
  }, [data]);

  // Couleur du badge de cursus = couleur de la catégorie de compétence portant
  // le même nom que `cursus.category` (champ texte toujours renseigné — on
  // évite de passer par `skill_id`, qui peut être nul pour certains cursus,
  // par ex. CE n'a pour l'instant aucune compétence associée en base).
  const cursusColorById = useMemo(() => {
    const colorByCategoryName: Record<string, string> = {};
    for (const c of data?.categories ?? []) colorByCategoryName[c.name] = c.color;
    const m: Record<string, string> = {};
    for (const c of data?.allCursus ?? []) {
      m[c.id] = (c.category && colorByCategoryName[c.category]) || 'slate';
    }
    return m;
  }, [data]);

  const chronoQ = chronoQuery.trim().toLowerCase();
  const chronoEvents = useMemo(() => {
    if (!data) return [];
    // Regroupe les validations par séance : un même cahier de doublure (ou,
    // à défaut, le même nom+date d'événement déclaré sans doublure associée)
    // peut valider plusieurs compétences d'un coup.
    const groups = new Map<
      string,
      {
        key: string;
        profileId: string;
        cursusId: string;
        doublureId: string | null;
        eventName: string | null;
        eventDate: string | null;
        eventLieu: string | null;
        supervisorName: string | null;
        supervisorAntenne: string | null;
        message: string | null;
        supervisorComment: string | null;
        isExternal: boolean;
        isPending: boolean;
        phaseName: string | null;
        validatedAt: string;
        competences: { id: string; name: string }[];
      }
    >();
    for (const ev of data.competenceEvents) {
      const groupKey = ev.doublure_id
        ? `d:${ev.doublure_id}`
        : `e:${ev.volunteer_cursus_id}:${ev.event_date ?? ''}:${ev.event_name ?? ''}`;
      const existing = groups.get(groupKey);
      if (existing) {
        existing.competences.push({ id: ev.competence_id, name: ev.competence_name });
        if (!existing.phaseName && ev.phase_name) existing.phaseName = ev.phase_name;
        if (ev.validated_at > existing.validatedAt) existing.validatedAt = ev.validated_at;
      } else {
        groups.set(groupKey, {
          key: groupKey,
          profileId: ev.profile_id,
          cursusId: ev.cursus_id,
          doublureId: ev.doublure_id,
          eventName: ev.event_name,
          eventDate: ev.event_date,
          eventLieu: ev.event_lieu,
          supervisorName: ev.supervisor_name,
          supervisorAntenne: ev.supervisor_antenne,
          message: ev.message,
          supervisorComment: ev.supervisor_comment,
          isExternal: ev.is_external,
          isPending: ev.is_pending,
          phaseName: ev.phase_name,
          validatedAt: ev.validated_at,
          competences: [{ id: ev.competence_id, name: ev.competence_name }],
        });
      }
    }

    return Array.from(groups.values())
      .filter((g) => chronoProfileId === 'all' || g.profileId === chronoProfileId)
      .filter((g) => chronoCursusId === 'all' || g.cursusId === chronoCursusId)
      .map((g) => {
        const p = profileById[g.profileId];
        const c = cursusById[g.cursusId];
        return {
          ...g,
          profileName: p?.full_name ?? p?.email ?? '—',
          profileInitials: initials(p?.full_name ?? p?.email ?? '?'),
          cursusName: c?.name ?? '—',
          cursusCode: c?.code ?? '—',
        };
      })
      .filter((g) => {
        if (!chronoQ) return true;
        const haystack = [
          g.profileName,
          g.cursusName,
          g.cursusCode,
          g.eventName ?? '',
          g.eventLieu ?? '',
          ...g.competences.map((c) => c.name),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(chronoQ);
      })
      .sort((a, b) => (a.validatedAt < b.validatedAt ? 1 : -1));
  }, [data, chronoProfileId, chronoCursusId, chronoQ, profileById, cursusById]);

  // Regroupe les séances par jour calendaire pour un en-tête de date commun,
  // à la manière des en-têtes de mois de la vue « Missions ».
  const chronoDayGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; events: typeof chronoEvents }> = [];
    const indexByKey = new Map<string, number>();
    for (const ev of chronoEvents) {
      const refDate = ev.eventDate ?? ev.validatedAt;
      const d = new Date(refDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      let index = indexByKey.get(key);
      if (index === undefined) {
        index = groups.length;
        indexByKey.set(key, index);
        const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        groups.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), events: [] });
      }
      groups[index].events.push(ev);
    }
    return groups;
  }, [chronoEvents]);

  function toggleEventExpanded(key: string) {
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── Éditeur popover ─────────────────────────────────────────

  function openEditor(
    e: React.MouseEvent<HTMLElement>,
    profileId: string,
    sk: { id: string; code: string; name: string }
  ) {
    const r = e.currentTarget.getBoundingClientRect();
    setEditor({
      profileId,
      skillId: sk.id,
      skillCode: sk.code,
      skillName: sk.name,
      profileName: profileById[profileId]?.full_name ?? profileById[profileId]?.email ?? '—',
      current: eff(profileId, sk.id),
      x: r.left + r.width / 2,
      y: r.bottom,
    });
  }

  // ── Création d'un cahier de doublure depuis la flèche d'un badge ─────

  function openCreateCursus(e: React.MouseEvent<HTMLElement>, pid: string, name: string, cursus: CursusRef) {
    const r = e.currentTarget.getBoundingClientRect();
    setCreateCursusError(null);
    setCreateCursusTarget({ pid, name, cursus, x: r.left + r.width / 2, y: r.bottom });
  }

  function closeCreateCursus() {
    setCreateCursusTarget(null);
    setCreateCursusError(null);
  }

  async function confirmCreateCursus() {
    if (!createCursusTarget) return;
    const { pid, cursus } = createCursusTarget;
    setCreateCursusSubmitting(true);
    setCreateCursusError(null);
    try {
      const res = await fetch('/api/admin/competences-dashboard', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enroll', profile_id: pid, cursus_id: cursus.id }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Erreur lors de la création du cahier.");
      }
      setData((d) => (d ? { ...d, enrolledCursus: [...d.enrolledCursus, { profile_id: pid, cursus_id: cursus.id, completed_at: null }] } : d));
      setCreateCursusTarget(null);
      router.push(`/competences?profile=${encodeURIComponent(pid)}&cursus=${encodeURIComponent(cursus.id)}`);
    } catch (e) {
      setCreateCursusError((e as Error).message);
    } finally {
      setCreateCursusSubmitting(false);
    }
  }

  // ── Rendu ───────────────────────────────────────────────────

  if (allowed === false) {
    return (
      <div className="rounded-xl border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
        Accès refusé : page réservée aux administrateurs de cursus.
      </div>
    );
  }

  if (loading || !data || !cat) {
    return <p className="text-sm text-ink-2">Chargement…</p>;
  }

  const editorVw = typeof window !== 'undefined' ? window.innerWidth : 1080;
  const statusTiles: Array<{ key: 'all' | string; label: string; n: number; color: string }> = [
    { key: 'all', label: 'Tous', n: catStats.total, color: '#002D74' },
    ...data.statuses.map((s) => ({ key: s.key, label: s.label, n: catStats.counts[s.key] ?? 0, color: palette(s.color).accent })),
  ];

  return (
    <div>
      {/* breadcrumb */}
      <div className="mb-[14px] text-[12.5px] font-semibold text-ink-3">
        Compétences <span className="text-ink-4">›</span>{' '}
        <span className="text-ink-2">Tableau de bord</span>
      </div>

      {/* title */}
      <div className="mb-5">
        <h1 className="text-[26px] font-black tracking-[-0.02em] text-ink">
          Suivi des compétences
        </h1>
        <div className="mt-1.5 text-sm text-ink-2">
          Qui détient quoi, par catégorie de compétence et par bénévole.
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-[10px] border border-bad/30 bg-bad-soft px-[14px] py-2.5 text-[13px] text-bad">
          {error}
        </div>
      ) : null}

      {/* category nav */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {data.categories.map((c) => {
          const active = c.id === cat.id;
          const cp = palette(c.color);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCatId(c.id);
                setStatusFilter('all');
                setQuery('');
                setExpandedSkillIds(new Set());
              }}
              className={cn(
                'inline-flex flex-none cursor-pointer items-center gap-[9px] rounded-[11px] border px-[15px] py-[9px] text-[13.5px] font-bold',
                active ? 'text-white' : 'border-line bg-surface-card text-ink-2'
              )}
              style={active ? { borderColor: cp.accent, background: cp.accent } : undefined}
            >
              <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: active ? '#fff' : cp.accent }} />
              {c.name}
              <span className={cn('text-xs font-bold', active ? 'text-white/70' : 'text-ink-3')}>
                {c.skills.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* category summary */}
      <div className="mb-4 rounded-2xl border border-line bg-surface-card px-[22px] py-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div
              className="mb-[7px] inline-flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[.1em]"
              style={{ color: pal.accent }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: pal.accent }} />
              Catégorie de compétence
            </div>
            <h2 className="text-[23px] font-extrabold tracking-[-0.01em] text-ink">
              {cat.name}
            </h2>
            <div className="mt-[7px] text-[13.5px] text-ink-2">
              {cat.skills.length} compétences · {catStats.peopleCount} bénévoles concernés
            </div>
          </div>
          <div className="flex max-w-full flex-none gap-2.5 overflow-x-auto pb-0.5">
            {statusTiles.map((tile) => {
              const active = statusFilter === tile.key;
              return (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => setStatusFilter(tile.key)}
                  title={`Filtrer sur « ${tile.label} »`}
                  className="min-w-[66px] flex-none cursor-pointer rounded-[10px] border px-2 py-1 text-center"
                  style={{
                    borderColor: active ? tile.color : 'transparent',
                    background: active ? `${tile.color}14` : 'transparent',
                  }}
                >
                  <div className="text-2xl font-extrabold leading-none" style={{ color: tile.color }}>{tile.n}</div>
                  <div className="mt-1 whitespace-nowrap text-[11.5px] font-semibold text-ink-2">
                    {tile.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="mb-[18px] flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-[10px] border border-line bg-surface-card p-[3px]">
          {(['arbre', 'tableau', 'chronologie'] as const).map((v) => {
            const active = view === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  'cursor-pointer rounded-[7px] px-[15px] py-[7px] text-[13px] font-bold',
                  active ? 'bg-brand text-white' : 'bg-transparent text-ink-2'
                )}
              >
                {v === 'arbre' ? 'Vue arbre' : v === 'tableau' ? 'Vue tableau' : 'Chronologie'}
              </button>
            );
          })}
        </div>

        {view !== 'chronologie' ? (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un bénévole…"
            className="min-w-[180px] max-w-[280px] flex-1 rounded-[10px] border border-line bg-surface-card px-[13px] py-[9px] text-[13.5px] text-ink outline-none"
          />
        ) : (
          <>
            <select
              value={chronoProfileId}
              onChange={(e) => setChronoProfileId(e.target.value)}
              className="rounded-[10px] border border-line bg-surface-card px-[13px] py-[9px] text-[13.5px] text-ink outline-none"
            >
              <option value="all">Tous les bénévoles</option>
              {data.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.email}
                </option>
              ))}
            </select>
            <select
              value={chronoCursusId}
              onChange={(e) => setChronoCursusId(e.target.value)}
              className="rounded-[10px] border border-line bg-surface-card px-[13px] py-[9px] text-[13.5px] text-ink outline-none"
            >
              <option value="all">Tous les cursus</option>
              {data.allCursus.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
            <input
              value={chronoQuery}
              onChange={(e) => setChronoQuery(e.target.value)}
              placeholder="Rechercher (bénévole, compétence, lieu…)"
              className="min-w-[200px] max-w-[320px] flex-1 rounded-[10px] border border-line bg-surface-card px-[13px] py-[9px] text-[13.5px] text-ink outline-none"
            />
          </>
        )}
      </div>

      {/* ARBRE */}
      {view === 'arbre' ? (
        <div className="flex flex-col gap-[14px]">
          {arbreSkills.map((sk) => (
            <div
              key={sk.id}
              className="overflow-hidden rounded-2xl border border-line bg-surface-card shadow-card"
            >
              <div className="flex items-center gap-3 border-b border-line-row px-[18px] py-[15px]">
                <span
                  className="min-w-[52px] flex-none rounded-lg border px-[9px] py-[5px] text-center text-[13px] font-extrabold"
                  style={{ color: pal.accent, background: pal.soft, borderColor: pal.softBorder }}
                >
                  {sk.code}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-extrabold text-ink">{sk.name}</div>
                  {sk.metaLine ? <div className="mt-0.5 text-[12.5px] text-ink-3">{sk.metaLine}</div> : null}
                </div>
                <button
                  type="button"
                  onClick={() => toggleExpanded(sk.id)}
                  title={sk.expanded ? 'Afficher uniquement la compétence la plus haute' : 'Afficher tous les bénévoles ayant cette compétence'}
                  className={cn(
                    'flex-none cursor-pointer rounded-lg border px-[11px] py-[5px] text-[13px] font-extrabold',
                    sk.expanded ? 'border-brand bg-brand text-white' : 'border-transparent bg-surface-sub text-ink-2'
                  )}
                >
                  {sk.countLabel}
                </button>
              </div>

              {sk.hasHolders ? (
                <div className="flex flex-wrap gap-[9px] px-[18px] py-[15px]">
                  {sk.holders.map((h) => {
                    const inner = (
                      <>
                        <span
                          className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-extrabold"
                          style={{ background: h.avatarBg, color: h.avatarColor }}
                        >
                          {h.initials}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-bold leading-tight text-ink">
                            {h.name}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {h.sector ? <span className="text-[11.5px] text-ink-3">{h.sector}</span> : null}
                            <span className="text-[11px] font-bold" style={{ color: h.text }}>
                              {h.sector ? '· ' : ''}
                              {h.statusLabel}
                            </span>
                          </div>
                        </div>
                      </>
                    );
                    const arrowStyle: React.CSSProperties = {
                      flex: 'none',
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 800,
                      color: h.text,
                      background: h.avatarBg,
                    };
                    return (
                      <div
                        key={h.pid}
                        className={cn(
                          'flex items-center gap-2.5 rounded-xl border-[1.5px] bg-surface-card',
                          h.cursus ? 'py-2 pl-[9px] pr-2.5' : 'py-2 pl-[9px] pr-[13px]'
                        )}
                        style={{ borderColor: h.ring }}
                      >
                        {inner}
                        {h.cursus && h.cursusEnrolled ? (
                          <a
                            href={`/competences?profile=${encodeURIComponent(h.pid)}&cursus=${encodeURIComponent(
                              h.cursus.id
                            )}`}
                            title={`Cahier de doublure de ${h.name} — ${h.cursus.name}`}
                            style={{ ...arrowStyle, textDecoration: 'none', cursor: 'pointer' }}
                          >
                            ↗
                          </a>
                        ) : h.cursus ? (
                          <button
                            type="button"
                            onClick={(e) => openCreateCursus(e, h.pid, h.name, h.cursus!)}
                            title={`Créer un cahier de doublure pour ${h.name} — ${h.cursus.name}`}
                            style={{ ...arrowStyle, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            ↗
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-[18px] py-[14px] text-[13px] text-ink-3">{sk.emptyLabel}</div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* TABLEAU */}
      {view === 'tableau' ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface-card shadow-card">
          <div className="max-h-[70vh] overflow-auto">
            <div className="min-w-max">
              {/* header row */}
              <div className="sticky top-0 z-[2] flex border-b border-line bg-surface-sub">
                <div className="sticky left-0 w-[210px] flex-none border-r border-line-row bg-surface-sub px-4 py-3 text-[11px] font-extrabold uppercase tracking-[.04em] text-ink-3">
                  Bénévole
                </div>
                {tableCols.map((col) => (
                  <div
                    key={col.id}
                    title={col.name}
                    className="w-24 flex-none border-l border-line-row bg-surface-sub px-1.5 py-3 text-center"
                  >
                    <div className="text-[12.5px] font-extrabold" style={{ color: pal.accent }}>{col.code}</div>
                    <div className="mt-0.5 text-[10px] text-ink-3">{col.count}</div>
                  </div>
                ))}
              </div>

              {/* rows */}
              {tableRows.map((row) => (
                <div
                  key={row.pid}
                  className="flex border-b border-line-row"
                  style={{ background: row.bg }}
                >
                  <div
                    className="sticky left-0 flex w-[210px] flex-none items-center gap-2.5 border-r border-line-row px-4 py-[11px]"
                    style={{ background: row.bg }}
                  >
                    <span className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-surface-sub text-[11px] font-extrabold text-ink-2">
                      {row.initials}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold leading-tight text-ink">
                        {row.name}
                      </div>
                      {row.sector ? <div className="text-[11px] text-ink-3">{row.sector}</div> : null}
                    </div>
                  </div>
                  {tableCols.map((col) => {
                    const st = eff(row.pid, col.id);
                    const ss = st ? statusByKey[st] : null;
                    let bg = 'transparent';
                    let border = '1px dashed #E6EAF2';
                    let color = '#A6AEBE';
                    let mark = '·';
                    if (ss) {
                      if (ss.isValidating) {
                        bg = ss.ring;
                        border = 'none';
                        color = '#fff';
                        mark = ss.mark;
                      } else {
                        bg = ss.soft;
                        border = `1.5px solid ${ss.ring}`;
                        color = ss.text;
                        mark = ss.mark;
                      }
                    }
                    return (
                      <button
                        key={col.id}
                        type="button"
                        title={`${col.name}${ss ? ` — ${ss.label}` : ' — cliquer pour définir'}`}
                        onClick={(e) => openEditor(e, row.pid, col)}
                        className="flex w-24 flex-none cursor-pointer items-center justify-center border-l border-line-row bg-transparent py-[9px]"
                      >
                        <span
                          className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-[13px] font-extrabold"
                          style={{ background: bg, border, color }}
                        >
                          {mark}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* CHRONOLOGIE */}
      {view === 'chronologie' ? (
        <div className="relative">
          {chronoDayGroups.length > 0 ? (
            <div className="pointer-events-none absolute bottom-0 left-[23px] top-0 w-0.5 bg-line" />
          ) : null}
          <div className="flex flex-col gap-1">
          {chronoDayGroups.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface-card px-[18px] py-6 text-center text-[13.5px] text-ink-3">
              Aucun événement de montée en compétence ne correspond à ces filtres.
            </div>
          ) : (
            chronoDayGroups.map((day) => (
              <div key={day.key} className="mb-[14px]">
                <div className="pb-2 pl-14 pr-0.5 pt-1 text-xs font-extrabold uppercase tracking-[.06em] text-ink-3">
                  {day.label}
                </div>
                <div className="flex flex-col gap-2.5">
                  {day.events.map((g) => {
                    const expanded = expandedEventIds.has(g.key);
                    const cp = palette(cursusColorById[g.cursusId] ?? 'slate');
                    return (
                      <div key={g.key} className="relative pl-14">
                      <span
                        className="absolute left-6 top-7 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_4px_#F7F9FC]"
                        style={{ background: cp.accent }}
                      />
                      <div className="overflow-hidden rounded-[14px] border border-line bg-surface-card shadow-card">
                        <div className="px-4 py-[13px]">
                          <div className="flex items-center justify-between gap-2.5">
                            <a
                              href={`/competences?profile=${encodeURIComponent(g.profileId)}&cursus=${encodeURIComponent(g.cursusId)}`}
                              title={`Cahier de doublure de ${g.profileName} — ${g.cursusName}`}
                              className="flex-none cursor-pointer whitespace-nowrap rounded-lg border px-[9px] py-[5px] text-xs font-extrabold no-underline"
                              style={{ color: cp.accent, background: cp.soft, borderColor: cp.softBorder }}
                            >
                              {g.cursusCode}
                            </a>
                            <span className="flex-1 text-center text-[13.5px] font-bold text-ink">
                              {g.profileName}
                            </span>
                            <span className="flex-none rounded-full bg-engage px-[9px] py-0.5 text-xs font-extrabold tabular-nums text-white">
                              +{g.competences.length}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleEventExpanded(g.key)}
                            aria-expanded={expanded}
                            className="mt-[9px] block w-full cursor-pointer border-none bg-transparent p-0 text-left"
                          >
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
                              {g.phaseName ? (
                                <span className="font-bold text-ink-2">{g.phaseName}</span>
                              ) : null}
                              {g.eventName || g.eventLieu ? (
                                <span>
                                  {g.eventName}
                                  {g.eventName && g.eventLieu ? ' · ' : ''}
                                  {g.eventLieu}
                                </span>
                              ) : null}
                            </div>
                            {g.supervisorName ? (
                              <div className="mt-[3px] text-xs text-ink-2">
                                Encadré par <strong>{g.supervisorName}</strong>
                                {g.supervisorAntenne ? ` · ${g.supervisorAntenne}` : ''}
                              </div>
                            ) : null}
                          </button>
                        </div>
                        {expanded ? (
                          <div className="border-t border-line-row px-4 pb-[14px] pt-3">
                            {g.supervisorComment ? (
                              <div className="mb-2 text-xs italic leading-snug text-ink-2">
                                « {g.supervisorComment} » <span className="not-italic text-ink-3">— doubleur</span>
                              </div>
                            ) : null}
                            {g.message ? (
                              <div className="mb-2 text-xs leading-snug text-ink-3">
                                Note perso : {g.message}
                              </div>
                            ) : null}
                            <div className="flex flex-col gap-1.5">
                              {g.competences.map((c) => (
                                <div
                                  key={c.id}
                                  className="flex items-center gap-2.5 border-l-[3px] border-ok-line px-2.5 py-1.5"
                                >
                                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-engage text-[10.5px] font-extrabold text-white">
                                    ✓
                                  </span>
                                  <span className="text-[13px] font-bold text-ink">{c.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          </div>
        </div>
      ) : null}

      {/* status editor popover */}
      {editor ? (
        <>
          <div
            onClick={() => setEditor(null)}
            className="fixed inset-0 z-[60]"
          />
          <div
            className="fixed z-[61] w-[230px] overflow-hidden rounded-xl border border-line bg-surface-card shadow-lift"
            style={{
              left: Math.max(12, Math.min(editor.x - 115, editorVw - 242)),
              top: editor.y + 8,
            }}
          >
            <div className="border-b border-line-row px-[13px] py-[11px]">
              <div className="text-[12.5px] font-extrabold text-ink">
                {editor.skillCode} · {editor.profileName}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-3">{editor.skillName}</div>
            </div>
            <div className="p-1.5">
              {data.statuses.map((s) => {
                const p = palette(s.color);
                const active = (editor.current ?? 'none') === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      void setStatus(editor.profileId, editor.skillId, s.key);
                      setEditor(null);
                    }}
                    className="flex w-full cursor-pointer items-center gap-[9px] rounded-lg bg-transparent px-2.5 py-[9px] text-left text-[13px] font-bold text-ink-2"
                  >
                    <span
                      className="h-[13px] w-[13px] flex-none rounded"
                      style={{
                        background: s.is_validating ? p.accent : p.soft,
                        border: s.is_validating ? 'none' : `1.5px solid ${p.accent}`,
                      }}
                    />
                    <span className="flex-1">{s.label}</span>
                    {active ? <span className="text-[13px] text-engage">✓</span> : null}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  void setStatus(editor.profileId, editor.skillId, 'none');
                  setEditor(null);
                }}
                className="flex w-full cursor-pointer items-center gap-[9px] rounded-lg bg-transparent px-2.5 py-[9px] text-left text-[13px] font-bold text-ink-2"
              >
                <span className="h-[13px] w-[13px] flex-none rounded border-[1.5px] border-dashed border-line-field bg-surface-card" />
                <span className="flex-1">Non acquise</span>
                {editor.current === null ? <span className="text-[13px] text-engage">✓</span> : null}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* confirmation de création d'un cahier de doublure */}
      {createCursusTarget ? (
        <>
          <div onClick={closeCreateCursus} className="fixed inset-0 z-[100]" />
          <div
            className="fixed z-[101] w-[260px] rounded-xl border border-line bg-surface-card p-[14px] shadow-lift"
            style={{
              left: Math.max(12, Math.min(createCursusTarget.x - 130, editorVw - 272)),
              top: createCursusTarget.y + 8,
            }}
          >
            <div className="text-[13px] font-extrabold text-ink">Créer un cahier de doublure</div>
            <div className="mt-1.5 text-[12.5px] text-ink-2">
              {createCursusTarget.name} → <strong>{createCursusTarget.cursus.name}</strong>
            </div>
            {createCursusError ? (
              <div className="mt-2 rounded-lg border border-bad/30 bg-bad-soft px-2.5 py-1.5 text-xs text-bad">
                {createCursusError}
              </div>
            ) : null}
            <div className="mt-2.5 flex justify-end gap-2">
              <Button variant="subtle" onClick={closeCreateCursus} className="px-3 py-[7px] text-[12.5px]">
                Annuler
              </Button>
              <Button variant="primary" disabled={createCursusSubmitting} onClick={confirmCreateCursus} className="px-3 py-[7px] text-[12.5px]">
                Créer
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {/* legend */}
      <div className="mt-[18px] flex flex-wrap items-center gap-[18px] rounded-[13px] border border-line bg-surface-card px-[18px] py-[13px] text-[12.5px] text-ink-2">
        <span className="text-[11px] font-bold uppercase tracking-[.04em] text-ink-3">
          Statut
        </span>
        {data.statuses.map((s) => {
          const p = palette(s.color);
          return (
            <span key={s.id} className="inline-flex items-center gap-[7px]">
              <span
                className="h-[14px] w-[14px] rounded-[5px]"
                style={{
                  background: s.is_validating ? p.accent : p.soft,
                  border: s.is_validating ? 'none' : `1.5px solid ${p.accent}`,
                }}
              />
              {s.label}
            </span>
          );
        })}
        <span className="ml-auto text-xs text-ink-4">
          Le contour de chaque bénévole reflète son statut.
        </span>
      </div>
    </div>
  );
}
