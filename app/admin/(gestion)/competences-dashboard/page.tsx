'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
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

type CursusRef = { id: string; code: string; name: string };

type DashboardData = {
  categories: ApiCategory[];
  profiles: ApiProfile[];
  profileSkills: ApiProfileSkill[];
  cursusBySkill: Record<string, CursusRef>;
};

// ── Statuts ───────────────────────────────────────────────────

type StatusKey = 'valide' | 'formation' | 'interesse' | 'a_recycler';

const STATUS: Record<
  StatusKey,
  { label: string; ring: string; dot: string; soft: string; text: string; mark: string }
> = {
  valide: { label: 'Validée', ring: '#059669', dot: '#059669', soft: '#ecfdf5', text: '#047857', mark: '✓' },
  formation: { label: 'En formation', ring: '#2563eb', dot: '#2563eb', soft: '#eff6ff', text: '#1d4ed8', mark: '✓' },
  interesse: { label: 'Intéressé·e', ring: '#7c3aed', dot: '#7c3aed', soft: '#f5f3ff', text: '#6d28d9', mark: '★' },
  a_recycler: { label: 'À recycler', ring: '#ea580c', dot: '#ea580c', soft: '#fff7ed', text: '#c2410c', mark: '↻' },
};

// Normalise les statuts (y compris les valeurs historiques) vers les 4 statuts
// métier du tableau de bord.
function normalizeStatus(raw: string | null | undefined): StatusKey | null {
  switch (raw) {
    case 'valide':
    case 'exempte':
      return 'valide';
    case 'formation':
    case 'a_faire':
      return 'formation';
    case 'interesse':
      return 'interesse';
    case 'a_recycler':
      return 'a_recycler';
    default:
      return null;
  }
}

// ── Palette des catégories (couleur nommée → accents) ─────────

const CATEGORY_PALETTE: Record<string, { accent: string; soft: string; softBorder: string }> = {
  slate: { accent: '#475569', soft: '#f1f5f9', softBorder: '#e2e8f0' },
  amber: { accent: '#d97706', soft: '#fffbeb', softBorder: '#fde68a' },
  sky: { accent: '#0284c7', soft: '#f0f9ff', softBorder: '#bae6fd' },
  violet: { accent: '#7c3aed', soft: '#f5f3ff', softBorder: '#ddd6fe' },
  emerald: { accent: '#059669', soft: '#ecfdf5', softBorder: '#a7f3d0' },
  pink: { accent: '#db2777', soft: '#fdf2f8', softBorder: '#fbcfe8' },
  rose: { accent: '#e11d48', soft: '#fff1f2', softBorder: '#fecdd3' },
  orange: { accent: '#ea580c', soft: '#fff7ed', softBorder: '#fed7aa' },
  cyan: { accent: '#0891b2', soft: '#ecfeff', softBorder: '#a5f3fc' },
  indigo: { accent: '#4f46e5', soft: '#eef2ff', softBorder: '#c7d2fe' },
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

const STATUS_FILTERS: Array<{ key: 'all' | StatusKey; label: string; dot: string }> = [
  { key: 'all', label: 'Tous', dot: '#94a3b8' },
  { key: 'valide', label: 'Validée', dot: '#059669' },
  { key: 'formation', label: 'En formation', dot: '#2563eb' },
  { key: 'interesse', label: 'Intéressé·e', dot: '#7c3aed' },
  { key: 'a_recycler', label: 'À recycler', dot: '#ea580c' },
];

const EDITOR_OPTIONS: Array<{ key: StatusKey | 'none'; label: string; dotBg: string; dotBorder: string }> = [
  { key: 'valide', label: 'Validée', dotBg: '#059669', dotBorder: 'none' },
  { key: 'formation', label: 'En formation', dotBg: '#eff6ff', dotBorder: '1.5px solid #2563eb' },
  { key: 'interesse', label: 'Intéressé·e', dotBg: '#f5f3ff', dotBorder: '1.5px solid #7c3aed' },
  { key: 'a_recycler', label: 'À recycler', dotBg: '#fff7ed', dotBorder: '1.5px solid #ea580c' },
  { key: 'none', label: 'Non acquise', dotBg: '#fff', dotBorder: '1.5px dashed #cbd5e1' },
];

type EditorState = {
  profileId: string;
  skillId: string;
  skillCode: string;
  skillName: string;
  profileName: string;
  current: StatusKey | null;
  implied: boolean;
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
  const [view, setView] = useState<'arbre' | 'tableau'>('arbre');
  const [statusFilter, setStatusFilter] = useState<'all' | StatusKey>('all');
  const [query, setQuery] = useState('');
  const [onlyHighest, setOnlyHighest] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);

  // Statuts effectifs, clé `${profileId}|${skillId}` → statut brut.
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});

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
    async (profileId: string, skillId: string, next: StatusKey | 'none') => {
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

  const eff = useCallback(
    (profileId: string, skillId: string): StatusKey | null =>
      normalizeStatus(statusMap[`${profileId}|${skillId}`]),
    [statusMap]
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

  // Cascade hiérarchique : dans une catégorie, une formation supérieure validée
  // implique que toutes les inférieures (display_order plus petit) le sont aussi.
  // `display_order` croissant = compétence de plus en plus haute.
  const skillOrderById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const sk of cat?.skills ?? []) m[sk.id] = sk.display_order;
    return m;
  }, [cat]);

  // Pour chaque bénévole, le display_order le plus haut où il a un 'valide' explicite.
  const maxValideOrderByProfile = useMemo(() => {
    const m: Record<string, number> = {};
    if (cat && data) {
      for (const sk of cat.skills) {
        for (const p of data.profiles) {
          if (normalizeStatus(statusMap[`${p.id}|${sk.id}`]) === 'valide') {
            if (m[p.id] === undefined || sk.display_order > m[p.id]) m[p.id] = sk.display_order;
          }
        }
      }
    }
    return m;
  }, [cat, data, statusMap]);

  // Statut effectif d'une cellule, implication comprise. Un statut explicite prime
  // toujours ; à défaut, 'valide' est déduit si une compétence supérieure est validée.
  const effInfo = useCallback(
    (pid: string, skillId: string): { status: StatusKey | null; implied: boolean } => {
      const explicit = normalizeStatus(statusMap[`${pid}|${skillId}`]);
      if (explicit) return { status: explicit, implied: false };
      const order = skillOrderById[skillId];
      const maxV = maxValideOrderByProfile[pid];
      if (order !== undefined && maxV !== undefined && maxV > order) {
        return { status: 'valide', implied: true };
      }
      return { status: null, implied: false };
    },
    [statusMap, skillOrderById, maxValideOrderByProfile]
  );

  // Compteurs de la catégorie + bénévoles concernés.
  const catStats = useMemo(() => {
    let nValide = 0,
      nFormation = 0,
      nInteresse = 0,
      nRecycler = 0;
    const people = new Set<string>();
    if (cat && data) {
      for (const sk of cat.skills) {
        for (const p of data.profiles) {
          const st = effInfo(p.id, sk.id).status;
          if (!st) continue;
          people.add(p.id);
          if (st === 'valide') nValide++;
          else if (st === 'formation') nFormation++;
          else if (st === 'interesse') nInteresse++;
          else nRecycler++;
        }
      }
    }
    return { nValide, nFormation, nInteresse, nRecycler, peopleCount: people.size };
  }, [cat, data, effInfo]);

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

  // ── Vue arbre ───────────────────────────────────────────────

  const arbreSkills = useMemo(() => {
    if (!cat || !data) return [];
    return cat.skills
      .map((sk, i) => {
        const allHolders = data.profiles
          .map((p) => ({ pid: p.id, ...effInfo(p.id, sk.id) }))
          .filter((x) => x.status && (!onlyHighest || highestIdx[x.pid] === i)) as Array<{
          pid: string;
          status: StatusKey;
          implied: boolean;
        }>;
        const filtered = allHolders.filter(
          (x) => matchPerson(x.pid) && (statusFilter === 'all' || x.status === statusFilter)
        );
        const holders = filtered.map(({ pid, status: st, implied }) => {
          const p = profileById[pid];
          const ss = STATUS[st];
          const cursus = data.cursusBySkill[sk.id];
          return {
            pid,
            name: p?.full_name ?? p?.email ?? '—',
            sector: p?.sector ?? '',
            initials: initials(p?.full_name ?? p?.email ?? '?'),
            // Validation implicite (héritée d'une formation supérieure) → libellé et
            // contour pointillés pour la distinguer d'une validation directe.
            statusLabel: implied ? 'Validée (implicite)' : ss.label,
            ring: ss.ring,
            ringStyle: implied ? 'dashed' : 'solid',
            avatarBg: ss.soft,
            avatarColor: ss.text,
            text: ss.text,
            cursus,
          };
        });
        const totalH = allHolders.length;
        const vCount = allHolders.filter((x) => x.status === 'valide').length;
        const metaBits: string[] = [];
        if (sk.level && sk.level > 0) metaBits.push(`Niveau ${sk.level}`);
        metaBits.push(`${vCount}/${totalH} validées`);
        return {
          id: sk.id,
          code: sk.code || sk.name,
          name: sk.name,
          metaLine: metaBits.join(' · '),
          holders,
          hasHolders: holders.length > 0,
          countLabel: filtering
            ? `${holders.length} / ${totalH}`
            : `${totalH} ${totalH > 1 ? 'bénévoles' : 'bénévole'}`,
          emptyLabel: filtering
            ? 'Aucun bénévole ne correspond au filtre.'
            : 'Personne ne détient encore cette compétence.',
        };
      })
      .filter((sk) => {
        if (filtering || onlyHighest) return sk.hasHolders;
        return true;
      });
  }, [cat, data, effInfo, onlyHighest, highestIdx, matchPerson, statusFilter, profileById, filtering]);

  // ── Vue tableau ─────────────────────────────────────────────

  const tableCols = useMemo(() => {
    if (!cat || !data) return [];
    return cat.skills.map((sk) => {
      const n = data.profiles.filter((p) => effInfo(p.id, sk.id).status).length;
      return { id: sk.id, code: sk.code || sk.name, name: sk.name, count: `${n} bén.` };
    });
  }, [cat, data, effInfo]);

  const tableRows = useMemo(() => {
    if (!cat || !data) return [];
    return data.profiles
      .filter((p) => matchPerson(p.id))
      .map((p, idx) => ({
        pid: p.id,
        name: p.full_name ?? p.email,
        sector: p.sector ?? '',
        initials: initials(p.full_name ?? p.email),
        bg: idx % 2 === 0 ? '#fff' : '#fcfdfe',
      }));
  }, [cat, data, matchPerson]);

  // ── Éditeur popover ─────────────────────────────────────────

  function openEditor(
    e: React.MouseEvent<HTMLElement>,
    profileId: string,
    sk: { id: string; code: string; name: string }
  ) {
    const r = e.currentTarget.getBoundingClientRect();
    const info = effInfo(profileId, sk.id);
    setEditor({
      profileId,
      skillId: sk.id,
      skillCode: sk.code,
      skillName: sk.name,
      profileName: profileById[profileId]?.full_name ?? profileById[profileId]?.email ?? '—',
      // Statut explicite stocké (l'implication ne crée pas de ligne) ; on note si
      // la cellule est validée par héritage pour l'afficher dans le popover.
      current: eff(profileId, sk.id),
      implied: info.implied,
      x: r.left + r.width / 2,
      y: r.bottom,
    });
  }

  // ── Rendu ───────────────────────────────────────────────────

  if (allowed === false) {
    return (
      <div
        style={{
          borderRadius: 12,
          border: '1px solid #fecaca',
          background: '#fef2f2',
          padding: 16,
          fontSize: 14,
          color: '#b91c1c',
        }}
      >
        Accès refusé : page réservée aux administrateurs de cursus.
      </div>
    );
  }

  if (loading || !data || !cat) {
    return <p style={{ fontSize: 14, color: '#64748b' }}>Chargement…</p>;
  }

  const editorVw = typeof window !== 'undefined' ? window.innerWidth : 1080;

  return (
    <div style={{ fontFamily: "'Hanken Grotesk', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
      {/* breadcrumb */}
      <div style={{ fontSize: 12.5, color: '#94a3b8', fontWeight: 600, marginBottom: 14 }}>
        Compétences <span style={{ color: '#cbd5e1' }}>›</span>{' '}
        <span style={{ color: '#475569' }}>Tableau de bord</span>
      </div>

      {/* title */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Suivi des compétences
        </h1>
        <div style={{ marginTop: 6, fontSize: 14, color: '#64748b' }}>
          Qui détient quoi, par catégorie de compétence et par bénévole.
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginBottom: 16,
            borderRadius: 10,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            padding: '10px 14px',
            fontSize: 13,
            color: '#b91c1c',
          }}
        >
          {error}
        </div>
      ) : null}

      {/* category nav */}
      <div
        style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 20 }}
      >
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
              }}
              style={{
                flex: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                border: `1px solid ${active ? cp.accent : '#e2e8f0'}`,
                borderRadius: 11,
                padding: '9px 15px',
                fontSize: 13.5,
                fontWeight: 700,
                fontFamily: 'inherit',
                background: active ? cp.accent : '#fff',
                color: active ? '#fff' : '#475569',
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 3, background: active ? '#fff' : cp.accent }} />
              {c.name}
              <span
                style={{ fontSize: 12, fontWeight: 700, color: active ? 'rgba(255,255,255,.7)' : '#94a3b8' }}
              >
                {c.skills.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* category summary */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e7e9ee',
          borderRadius: 16,
          boxShadow: '0 2px 10px rgba(15,23,42,.04)',
          padding: '20px 22px',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: pal.accent,
                marginBottom: 7,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: pal.accent }} />
              Catégorie de compétence
            </div>
            <h2 style={{ margin: 0, fontSize: 23, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
              {cat.name}
            </h2>
            <div style={{ marginTop: 7, fontSize: 13.5, color: '#64748b' }}>
              {cat.skills.length} compétences · {catStats.peopleCount} bénévoles concernés
            </div>
          </div>
          <div style={{ display: 'flex', gap: 22, flex: 'none' }}>
            {[
              { n: catStats.nValide, label: 'validées', color: '#059669' },
              { n: catStats.nFormation, label: 'en formation', color: '#2563eb' },
              { n: catStats.nInteresse, label: 'intéressé·es', color: '#7c3aed' },
              { n: catStats.nRecycler, label: 'à recycler', color: '#ea580c' },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.n}</div>
                <div style={{ marginTop: 4, fontSize: 11.5, fontWeight: 600, color: '#64748b' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div
          style={{
            display: 'inline-flex',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: 3,
          }}
        >
          {(['arbre', 'tableau'] as const).map((v) => {
            const active = view === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                style={{
                  cursor: 'pointer',
                  border: 'none',
                  borderRadius: 7,
                  padding: '7px 15px',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  background: active ? '#0f172a' : 'transparent',
                  color: active ? '#fff' : '#64748b',
                }}
              >
                {v === 'arbre' ? 'Vue arbre' : 'Vue tableau'}
              </button>
            );
          })}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un bénévole…"
          style={{
            flex: 1,
            minWidth: 180,
            maxWidth: 280,
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '9px 13px',
            fontSize: 13.5,
            color: '#0f172a',
            outline: 'none',
            background: '#fff',
            fontFamily: 'inherit',
          }}
        />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginLeft: 'auto' }}>
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStatusFilter(s.key)}
                style={{
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  border: `1px solid ${active ? '#0f172a' : '#e2e8f0'}`,
                  background: active ? '#0f172a' : '#fff',
                  color: active ? '#fff' : '#475569',
                  borderRadius: 99,
                  padding: '6px 12px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.dot }} />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ARBRE */}
      {view === 'arbre' ? (
        <>
          <div style={{ marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => setOnlyHighest((v) => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                border: `1px solid ${onlyHighest ? '#cbd5e1' : '#e2e8f0'}`,
                background: onlyHighest ? '#f8fafc' : '#fff',
                borderRadius: 11,
                padding: '9px 14px',
                fontFamily: 'inherit',
              }}
            >
              <span
                style={{
                  flex: 'none',
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  border: `1.5px solid ${onlyHighest ? '#0f172a' : '#cbd5e1'}`,
                  background: onlyHighest ? '#0f172a' : '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {onlyHighest ? '✓' : ''}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                Afficher chaque bénévole uniquement sur sa compétence la plus haute
              </span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {arbreSkills.map((sk) => (
              <div
                key={sk.id}
                style={{
                  background: '#fff',
                  border: '1px solid #e7e9ee',
                  borderRadius: 16,
                  boxShadow: '0 1px 3px rgba(15,23,42,.04)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '15px 18px',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span
                    style={{
                      flex: 'none',
                      minWidth: 52,
                      textAlign: 'center',
                      fontSize: 13,
                      fontWeight: 800,
                      color: pal.accent,
                      background: pal.soft,
                      border: `1px solid ${pal.softBorder}`,
                      borderRadius: 8,
                      padding: '5px 9px',
                    }}
                  >
                    {sk.code}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{sk.name}</div>
                    <div style={{ marginTop: 2, fontSize: 12.5, color: '#94a3b8' }}>{sk.metaLine}</div>
                  </div>
                  <span
                    style={{
                      flex: 'none',
                      fontSize: 13,
                      fontWeight: 800,
                      color: '#334155',
                      background: '#f1f5f9',
                      borderRadius: 8,
                      padding: '5px 11px',
                    }}
                  >
                    {sk.countLabel}
                  </span>
                </div>

                {sk.hasHolders ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, padding: '15px 18px' }}>
                    {sk.holders.map((h) => {
                      const inner = (
                        <>
                          <span
                            style={{
                              flex: 'none',
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 800,
                              background: h.avatarBg,
                              color: h.avatarColor,
                            }}
                          >
                            {h.initials}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                              {h.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              {h.sector ? <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{h.sector}</span> : null}
                              <span style={{ fontSize: 11, fontWeight: 700, color: h.text }}>
                                {h.sector ? '· ' : ''}
                                {h.statusLabel}
                              </span>
                            </div>
                          </div>
                        </>
                      );
                      if (h.cursus) {
                        return (
                          <a
                            key={h.pid}
                            href={`/competences?profile=${encodeURIComponent(h.pid)}&cursus=${encodeURIComponent(
                              h.cursus.id
                            )}`}
                            title={`Cahier de doublure de ${h.name} — ${h.cursus.name}`}
                            style={{
                              textDecoration: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              background: '#fff',
                              border: `1.5px ${h.ringStyle} ${h.ring}`,
                              borderRadius: 12,
                              padding: '8px 10px 8px 9px',
                            }}
                          >
                            {inner}
                            <span
                              style={{
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
                              }}
                            >
                              ↗
                            </span>
                          </a>
                        );
                      }
                      return (
                        <div
                          key={h.pid}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            background: '#fff',
                            border: `1.5px ${h.ringStyle} ${h.ring}`,
                            borderRadius: 12,
                            padding: '8px 13px 8px 9px',
                          }}
                        >
                          {inner}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '14px 18px', fontSize: 13, color: '#94a3b8' }}>{sk.emptyLabel}</div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* TABLEAU */}
      {view === 'tableau' ? (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e7e9ee',
            borderRadius: 16,
            boxShadow: '0 1px 3px rgba(15,23,42,.04)',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 'max-content' }}>
              {/* header row */}
              <div style={{ display: 'flex', borderBottom: '1px solid #e7e9ee', background: '#f8fafc' }}>
                <div
                  style={{
                    flex: 'none',
                    width: 210,
                    padding: '12px 16px',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '.04em',
                    textTransform: 'uppercase',
                    color: '#94a3b8',
                    position: 'sticky',
                    left: 0,
                    background: '#f8fafc',
                    borderRight: '1px solid #eef1f5',
                  }}
                >
                  Bénévole
                </div>
                {tableCols.map((col) => (
                  <div
                    key={col.id}
                    title={col.name}
                    style={{
                      flex: 'none',
                      width: 96,
                      padding: '12px 6px',
                      textAlign: 'center',
                      borderLeft: '1px solid #f1f5f9',
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: pal.accent }}>{col.code}</div>
                    <div style={{ marginTop: 2, fontSize: 10, color: '#94a3b8' }}>{col.count}</div>
                  </div>
                ))}
              </div>

              {/* rows */}
              {tableRows.map((row) => (
                <div
                  key={row.pid}
                  style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', background: row.bg }}
                >
                  <div
                    style={{
                      flex: 'none',
                      width: 210,
                      padding: '11px 16px',
                      position: 'sticky',
                      left: 0,
                      background: row.bg,
                      borderRight: '1px solid #eef1f5',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        flex: 'none',
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 800,
                        background: '#f1f5f9',
                        color: '#64748b',
                      }}
                    >
                      {row.initials}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                        {row.name}
                      </div>
                      {row.sector ? <div style={{ fontSize: 11, color: '#94a3b8' }}>{row.sector}</div> : null}
                    </div>
                  </div>
                  {tableCols.map((col) => {
                    const { status: st, implied } = effInfo(row.pid, col.id);
                    const ss = st ? STATUS[st] : null;
                    let bg = 'transparent';
                    let border = '1px dashed #e5e9f0';
                    let color = '#cbd5e1';
                    let mark = '·';
                    if (ss) {
                      if (st === 'valide' && implied) {
                        // Validée par héritage d'une formation supérieure : vert « soft »
                        // + contour pointillé pour la distinguer d'une validation directe.
                        bg = ss.soft;
                        border = `1.5px dashed ${ss.ring}`;
                        color = ss.text;
                        mark = '✓';
                      } else if (st === 'valide') {
                        bg = ss.ring;
                        border = 'none';
                        color = '#fff';
                        mark = '✓';
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
                        title={`${col.name}${ss ? ` — ${ss.label}${implied ? ' (implicite)' : ''}` : ' — cliquer pour définir'}`}
                        onClick={(e) => openEditor(e, row.pid, col)}
                        style={{
                          flex: 'none',
                          width: 96,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          borderLeft: '1px solid #f6f8fa',
                          background: 'transparent',
                          padding: '9px 0',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <span
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 9,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 13,
                            fontWeight: 800,
                            background: bg,
                            border,
                            color,
                          }}
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

      {/* status editor popover */}
      {editor ? (
        <>
          <div
            onClick={() => setEditor(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 60 }}
          />
          <div
            style={{
              position: 'fixed',
              left: Math.max(12, Math.min(editor.x - 115, editorVw - 242)),
              top: editor.y + 8,
              zIndex: 61,
              width: 230,
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              boxShadow: '0 16px 40px rgba(15,23,42,.22)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '11px 13px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>
                {editor.skillCode} · {editor.profileName}
              </div>
              <div style={{ marginTop: 2, fontSize: 11, color: '#94a3b8' }}>{editor.skillName}</div>
              {editor.implied && !editor.current ? (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: '#047857' }}>
                  Validée par une formation supérieure. Définir un statut ici le forcera pour cette compétence.
                </div>
              ) : null}
            </div>
            <div style={{ padding: 6 }}>
              {EDITOR_OPTIONS.map((o) => {
                const active = (editor.current ?? 'none') === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => {
                      void setStatus(editor.profileId, editor.skillId, o.key);
                      setEditor(null);
                    }}
                    style={{
                      cursor: 'pointer',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      border: 'none',
                      background: 'transparent',
                      borderRadius: 8,
                      padding: '9px 10px',
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      color: '#334155',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        flex: 'none',
                        width: 13,
                        height: 13,
                        borderRadius: 4,
                        background: o.dotBg,
                        border: o.dotBorder === 'none' ? 'none' : o.dotBorder,
                      }}
                    />
                    <span style={{ flex: 1 }}>{o.label}</span>
                    {active ? <span style={{ color: '#059669', fontSize: 13 }}>✓</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {/* legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          flexWrap: 'wrap',
          marginTop: 18,
          padding: '13px 18px',
          background: '#fff',
          border: '1px solid #e7e9ee',
          borderRadius: 13,
          fontSize: 12.5,
          color: '#64748b',
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '.04em',
            fontSize: 11,
          }}
        >
          Statut
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 14, height: 14, borderRadius: 5, background: '#059669' }} />
          Compétence validée
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 14, height: 14, borderRadius: 5, background: '#eff6ff', border: '1.5px solid #2563eb' }} />
          En formation / doublure
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 14, height: 14, borderRadius: 5, background: '#f5f3ff', border: '1.5px solid #7c3aed' }} />
          Intéressé·e
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 14, height: 14, borderRadius: 5, background: '#fff7ed', border: '1.5px solid #ea580c' }} />
          À recycler
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#cbd5e1' }}>
          Le contour de chaque bénévole reflète son statut.
        </span>
      </div>
    </div>
  );
}
