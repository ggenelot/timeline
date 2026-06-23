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

type DashboardData = {
  categories: ApiCategory[];
  profiles: ApiProfile[];
  profileSkills: ApiProfileSkill[];
  cursusBySkill: Record<string, CursusRef>;
  statuses: ApiStatus[];
};

// ── Palette des catégories (couleur nommée → accents) ─────────
// Réutilisée aussi pour les statuts : ils partagent la même palette de
// couleurs nommées, configurable depuis la page « Compétences ».

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
  const [view, setView] = useState<'arbre' | 'tableau'>('arbre');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [query, setQuery] = useState('');
  const [expandedSkillIds, setExpandedSkillIds] = useState<Set<string>>(new Set());
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
          const cursus = data.cursusBySkill[sk.id];
          return {
            pid,
            name: p?.full_name ?? p?.email ?? '—',
            sector: p?.sector ?? '',
            initials: initials(p?.full_name ?? p?.email ?? '?'),
            statusLabel: ss?.label ?? st,
            ring: ss?.ring ?? '#cbd5e1',
            avatarBg: ss?.soft ?? '#f1f5f9',
            avatarColor: ss?.text ?? '#64748b',
            text: ss?.text ?? '#64748b',
            cursus,
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
  }, [cat, data, eff, highestIdx, matchPerson, statusFilter, profileById, filtering, expandedSkillIds, statusByKey]);

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
  const statusTiles: Array<{ key: 'all' | string; label: string; n: number; color: string }> = [
    { key: 'all', label: 'Tous', n: catStats.total, color: '#0f172a' },
    ...data.statuses.map((s) => ({ key: s.key, label: s.label, n: catStats.counts[s.key] ?? 0, color: palette(s.color).accent })),
  ];

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
                setExpandedSkillIds(new Set());
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
          <div
            style={{
              display: 'flex',
              gap: 10,
              flex: 'none',
              maxWidth: '100%',
              overflowX: 'auto',
              paddingBottom: 2,
            }}
          >
            {statusTiles.map((tile) => {
              const active = statusFilter === tile.key;
              return (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => setStatusFilter(tile.key)}
                  title={`Filtrer sur « ${tile.label} »`}
                  style={{
                    flex: 'none',
                    cursor: 'pointer',
                    textAlign: 'center',
                    minWidth: 66,
                    border: `1px solid ${active ? tile.color : 'transparent'}`,
                    borderRadius: 10,
                    background: active ? `${tile.color}14` : 'transparent',
                    padding: '4px 8px',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 800, color: tile.color, lineHeight: 1 }}>{tile.n}</div>
                  <div style={{ marginTop: 4, fontSize: 11.5, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>
                    {tile.label}
                  </div>
                </button>
              );
            })}
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
      </div>

      {/* ARBRE */}
      {view === 'arbre' ? (
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
                  {sk.metaLine ? <div style={{ marginTop: 2, fontSize: 12.5, color: '#94a3b8' }}>{sk.metaLine}</div> : null}
                </div>
                <button
                  type="button"
                  onClick={() => toggleExpanded(sk.id)}
                  title={sk.expanded ? 'Afficher uniquement la compétence la plus haute' : 'Afficher tous les bénévoles ayant cette compétence'}
                  style={{
                    flex: 'none',
                    cursor: 'pointer',
                    border: `1px solid ${sk.expanded ? '#0f172a' : 'transparent'}`,
                    fontSize: 13,
                    fontWeight: 800,
                    color: sk.expanded ? '#fff' : '#334155',
                    background: sk.expanded ? '#0f172a' : '#f1f5f9',
                    borderRadius: 8,
                    padding: '5px 11px',
                    fontFamily: 'inherit',
                  }}
                >
                  {sk.countLabel}
                </button>
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
                            border: `1.5px solid ${h.ring}`,
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
                          border: `1.5px solid ${h.ring}`,
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
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh' }}>
            <div style={{ minWidth: 'max-content' }}>
              {/* header row */}
              <div
                style={{
                  display: 'flex',
                  borderBottom: '1px solid #e7e9ee',
                  background: '#f8fafc',
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                }}
              >
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
                      background: '#f8fafc',
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
                    const st = eff(row.pid, col.id);
                    const ss = st ? statusByKey[st] : null;
                    let bg = 'transparent';
                    let border = '1px dashed #e5e9f0';
                    let color = '#cbd5e1';
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
            </div>
            <div style={{ padding: 6 }}>
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
                        background: s.is_validating ? p.accent : p.soft,
                        border: s.is_validating ? 'none' : `1.5px solid ${p.accent}`,
                      }}
                    />
                    <span style={{ flex: 1 }}>{s.label}</span>
                    {active ? <span style={{ color: '#059669', fontSize: 13 }}>✓</span> : null}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  void setStatus(editor.profileId, editor.skillId, 'none');
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
                    background: '#fff',
                    border: '1.5px dashed #cbd5e1',
                  }}
                />
                <span style={{ flex: 1 }}>Non acquise</span>
                {editor.current === null ? <span style={{ color: '#059669', fontSize: 13 }}>✓</span> : null}
              </button>
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
        {data.statuses.map((s) => {
          const p = palette(s.color);
          return (
            <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 5,
                  background: s.is_validating ? p.accent : p.soft,
                  border: s.is_validating ? 'none' : `1.5px solid ${p.accent}`,
                }}
              />
              {s.label}
            </span>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#cbd5e1' }}>
          Le contour de chaque bénévole reflète son statut.
        </span>
      </div>
    </div>
  );
}
