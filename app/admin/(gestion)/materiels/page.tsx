'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '@/lib/supabase/client';
import { Profile, MaterielType, MaterielTypeContent, MaterielCategory } from '@/lib/types';

const CATEGORY_PALETTE: Record<string, string> = {
  slate: '#475569', amber: '#d97706', sky: '#0284c7', violet: '#7c3aed', emerald: '#059669',
  pink: '#db2777', rose: '#e11d48', orange: '#ea580c', cyan: '#0891b2', indigo: '#4f46e5',
};

function categoryDot(color: string) {
  return CATEGORY_PALETTE[color] ?? CATEGORY_PALETTE.slate;
}

// ── Poignée de glisser-déposer ───────────────────────────────────

function DragHandle({ attributes, listeners, style }: {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  style?: React.CSSProperties;
}) {
  return (
    <span
      {...attributes}
      {...listeners}
      title="Glisser pour réordonner ou déplacer"
      style={{ flexShrink: 0, cursor: 'grab', color: '#cbd5e1', fontSize: 13, lineHeight: 1, letterSpacing: -3, touchAction: 'none', ...style }}
    >
      ⠿⠿
    </span>
  );
}

const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#0f172a', outline: 'none', fontFamily: 'inherit' };

// ── Formulaire « + Ajouter un contenant » ───────────────────────────

function AddContainerForm({ categories, onSubmit, onCancel }: {
  categories: MaterielCategory[];
  onSubmit: (name: string, code: string, categoryId: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit(name.trim(), code.trim(), categoryId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px dashed #cbd5e1', borderRadius: 10, padding: '9px 11px', flexWrap: 'wrap' }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du contenant" autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') onCancel(); }}
        style={{ ...inputStyle, flex: 1, minWidth: 120 }} />
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (optionnel)" maxLength={24}
        style={{ ...inputStyle, width: 140, textTransform: 'uppercase' }} />
      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ ...inputStyle, width: 160 }}>
        <option value="">Type…</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <button type="button" onClick={submit} disabled={saving || !name.trim()}
        style={{ cursor: saving || !name.trim() ? 'not-allowed' : 'pointer', border: 'none', background: saving || !name.trim() ? '#94a3b8' : '#059669', color: '#fff', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}>
        Ajouter
      </button>
      <button type="button" onClick={onCancel} aria-label="Annuler"
        style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 15, padding: '4px 6px', flexShrink: 0 }}>✕</button>
    </div>
  );
}

// ── Formulaire « + Ajouter un item » ─────────────────────────────────

function AddItemForm({ token, excludeIds, onSubmit, onCancel }: {
  token: string;
  excludeIds: Set<string>;
  onSubmit: (itemId: string, quantity: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MaterielType[]>([]);
  const [selected, setSelected] = useState<MaterielType | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/admin/materiel-types?kind=items&q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!active || !res.ok) return;
      const json = (await res.json()) as { types: MaterielType[] };
      setResults(json.types.filter((t) => !excludeIds.has(t.id)));
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [query, token, excludeIds]);

  async function submit() {
    if (!selected) return;
    setSaving(true);
    try {
      await onSubmit(selected.id, quantity);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px dashed #cbd5e1', borderRadius: 10, padding: '10px 11px' }}>
      {selected ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{selected.name}</span>
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 1)}
            style={{ ...inputStyle, width: 64, textAlign: 'center' }} />
          <button type="button" onClick={submit} disabled={saving}
            style={{ cursor: saving ? 'not-allowed' : 'pointer', border: 'none', background: saving ? '#94a3b8' : '#059669', color: '#fff', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}>
            Ajouter
          </button>
          <button type="button" onClick={() => setSelected(null)} aria-label="Changer"
            style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 15, padding: '4px 6px', flexShrink: 0 }}>✕</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un item de la bibliothèque…" autoFocus
              style={{ ...inputStyle, flex: 1 }} />
            <button type="button" onClick={onCancel} aria-label="Annuler"
              style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 15, padding: '4px 6px', flexShrink: 0 }}>✕</button>
          </div>
          {results.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              {results.map((t) => (
                <button key={t.id} type="button" onClick={() => setSelected(t)}
                  style={{ cursor: 'pointer', textAlign: 'left', border: '1px solid #eef1f5', background: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', color: '#0f172a' }}>
                  {t.name}{t.code ? <span style={{ color: '#94a3b8' }}> · {t.code}</span> : null}
                </button>
              ))}
            </div>
          ) : query.trim() ? (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Aucun item trouvé.</div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ── Contexte partagé de l'arbre ───────────────────────────────────────

type TreeCtxValue = {
  token: string;
  editMode: boolean;
  expanded: Set<string>;
  childrenByContainer: Record<string, MaterielTypeContent[]>;
  loadingContainers: Set<string>;
  categories: MaterielCategory[];
  toggleExpand: (containerId: string) => void;
  addContainer: (containerId: string, name: string, code: string, categoryId: string) => Promise<void>;
  addItem: (containerId: string, itemId: string, quantity: number) => Promise<void>;
  updateQuantity: (containerId: string, contentId: string, quantity: number) => Promise<void>;
  updateCategory: (typeId: string, containerId: string | null, categoryId: string) => Promise<void>;
  unlink: (containerId: string, contentId: string) => Promise<void>;
};

const TreeCtx = createContext<TreeCtxValue | null>(null);

function useTreeCtx(): TreeCtxValue {
  const ctx = useContext(TreeCtx);
  if (!ctx) throw new Error('TreeCtx manquant');
  return ctx;
}

// ── Zone de dépôt (conteneur droppable pour une liste d'enfants) ─────

function DropZone({ id, children, empty }: { id: string; children: React.ReactNode; empty?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} style={{
      borderRadius: 10,
      background: isOver ? '#eff6ff' : 'transparent',
      outline: isOver ? '2px dashed #93c5fd' : 'none',
      outlineOffset: 2,
      minHeight: empty ? 40 : undefined,
      transition: 'background .1s',
    }}>
      {children}
    </div>
  );
}

// ── Nœud de l'arbre (contenant ou item) ──────────────────────────────

type LinkMeta = {
  contentId: string;
  quantity: number;
  parentContainerId: string;
};

function TreeNode({ node, depth, meta, onFullDelete, sortableId }: {
  node: MaterielType;
  depth: number;
  meta?: LinkMeta;
  onFullDelete?: () => void;
  sortableId: string;
}) {
  const ctx = useTreeCtx();
  const [addMode, setAddMode] = useState<'container' | 'item' | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });

  const isExpanded = ctx.expanded.has(node.id);
  const isLoading = ctx.loadingContainers.has(node.id);
  const contents = ctx.childrenByContainer[node.id];
  const existingChildIds = new Set((contents ?? []).map((c) => c.child_type_id));

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        border: node.is_container ? '1px solid #eef1f5' : 'none',
        borderBottom: node.is_container ? '1px solid #eef1f5' : '1px solid #f1f5f9',
        borderRadius: node.is_container ? 12 : 0,
        padding: node.is_container ? '10px 12px' : '7px 4px',
        background: node.is_container ? '#fcfcfd' : 'transparent',
      }}>
        {ctx.editMode ? <DragHandle attributes={attributes} listeners={listeners} /> : null}
        {meta && !ctx.editMode ? (
          <span style={{ flexShrink: 0, minWidth: 22, fontSize: 12.5, fontWeight: 700, color: '#94a3b8' }}>{meta.quantity}x</span>
        ) : null}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            fontWeight: node.is_container ? 700 : 500,
            color: node.is_container ? '#0f172a' : '#475569',
            cursor: node.is_container ? 'pointer' : 'default',
          }}
          onClick={node.is_container ? () => ctx.toggleExpand(node.id) : undefined}
        >
          {node.name}
          {node.code ? <span style={{ marginLeft: 7, fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{node.code}</span> : null}
        </span>
        {node.is_container && !ctx.editMode && node.category ? (
          <span title={node.category.name} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: categoryDot(node.category.color) }} />
            {node.category.name}
          </span>
        ) : null}
        {node.is_container && ctx.editMode ? (
          <select
            value={node.category_id ?? ''}
            onChange={(e) => void ctx.updateCategory(node.id, meta?.parentContainerId ?? null, e.target.value)}
            style={{ ...inputStyle, width: 140, flexShrink: 0 }}
          >
            <option value="">Type…</option>
            {ctx.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : null}
        {meta ? (
          <>
            {ctx.editMode ? (
              <input type="number" min={1} value={meta.quantity}
                onChange={(e) => void ctx.updateQuantity(meta.parentContainerId, meta.contentId, Number(e.target.value) || 1)}
                style={{ ...inputStyle, width: 58, textAlign: 'center', flexShrink: 0 }} />
            ) : null}
            {ctx.editMode ? (
              <button type="button" onClick={() => void ctx.unlink(meta.parentContainerId, meta.contentId)} aria-label="Retirer"
                style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#dc2626', fontSize: 15, padding: '4px 6px', flexShrink: 0 }}>✕</button>
            ) : null}
          </>
        ) : onFullDelete && ctx.editMode ? (
          <button type="button" onClick={onFullDelete}
            style={{ cursor: 'pointer', border: '1px solid #fecaca', background: '#fff', color: '#dc2626', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}>
            Supprimer
          </button>
        ) : null}
      </div>

      {isExpanded && node.is_container ? (
        <div style={{ marginLeft: 30, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isLoading ? (
            <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Chargement…</div>
          ) : (
            <DropZone id={`zone:${node.id}`} empty={(contents ?? []).length === 0}>
              <SortableContext items={(contents ?? []).map((c) => `node:${c.id}`)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(contents ?? []).length === 0 ? (
                    <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '2px' }}>
                      {ctx.editMode ? 'Ce contenant est vide. Glissez un élément ici, ou ajoutez-en un ci-dessous.' : 'Ce contenant est vide.'}
                    </div>
                  ) : (contents ?? []).map((c) => (
                    c.child_type ? (
                      <TreeNode
                        key={c.id}
                        sortableId={`node:${c.id}`}
                        node={c.child_type as MaterielType}
                        depth={depth + 1}
                        meta={{ contentId: c.id, quantity: c.quantity, parentContainerId: node.id }}
                      />
                    ) : null
                  ))}
                </div>
              </SortableContext>
            </DropZone>
          )}

          {ctx.editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {addMode === 'container' ? (
                <AddContainerForm
                  categories={ctx.categories}
                  onSubmit={async (name, code, categoryId) => { await ctx.addContainer(node.id, name, code, categoryId); setAddMode(null); }}
                  onCancel={() => setAddMode(null)}
                />
              ) : addMode === 'item' ? (
                <AddItemForm
                  token={ctx.token}
                  excludeIds={existingChildIds}
                  onSubmit={async (itemId, quantity) => { await ctx.addItem(node.id, itemId, quantity); setAddMode(null); }}
                  onCancel={() => setAddMode(null)}
                />
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setAddMode('container')}
                    style={{ cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 9, padding: '8px 12px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', flex: 1 }}>
                    + Ajouter un contenant
                  </button>
                  <button type="button" onClick={() => setAddMode('item')}
                    style={{ cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 9, padding: '8px 12px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', flex: 1 }}>
                    + Ajouter un item
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────

export default function AdminMaterielsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [roots, setRoots] = useState<MaterielType[]>([]);
  const [childrenByContainer, setChildrenByContainer] = useState<Record<string, MaterielTypeContent[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingContainers, setLoadingContainers] = useState<Set<string>>(new Set());
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [categories, setCategories] = useState<MaterielCategory[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const fetchRoots = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/materiel-types?kind=roots', { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) {
      const json = (await res.json()) as { types: MaterielType[] };
      setRoots(json.types);
    }
  }, []);

  const loadContents = useCallback(async (containerId: string, tok: string) => {
    setLoadingContainers((prev) => new Set(prev).add(containerId));
    const res = await fetch(`/api/admin/materiel-types/${containerId}/contents`, { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) {
      const json = (await res.json()) as { contents: MaterielTypeContent[] };
      setChildrenByContainer((prev) => ({ ...prev, [containerId]: json.contents }));
    }
    setLoadingContainers((prev) => { const next = new Set(prev); next.delete(containerId); return next; });
  }, []);

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id,full_name,email,role,sector,created_at')
        .eq('id', authData.user.id)
        .single();

      if (!profileData || profileData.role !== 'admin') {
        setLoading(false);
        setProfile(profileData ?? null);
        return;
      }

      setProfile(profileData);
      const { data: sessionData } = await supabase.auth.getSession();
      const tok = sessionData.session?.access_token ?? '';
      setToken(tok);
      await fetchRoots(tok);
      const { data: categoryData } = await supabase
        .from('materiel_categories')
        .select('id,name,color,display_order,created_at')
        .order('display_order', { ascending: true });
      setCategories(categoryData ?? []);
      setLoading(false);
    }
    void init();
  }, [router, fetchRoots]);

  function toggleExpand(containerId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(containerId)) {
        next.delete(containerId);
      } else {
        next.add(containerId);
        if (!childrenByContainer[containerId]) void loadContents(containerId, token);
      }
      return next;
    });
  }

  async function addContainer(containerId: string, name: string, code: string, categoryId: string) {
    const createRes = await fetch('/api/admin/materiel-types', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, is_container: true, category_id: categoryId || null }),
    });
    if (!createRes.ok) return;
    const { type } = (await createRes.json()) as { type: MaterielType };
    await fetch(`/api/admin/materiel-types/${containerId}/contents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_type_id: type.id, quantity: 1 }),
    });
    await loadContents(containerId, token);
  }

  async function addItem(containerId: string, itemId: string, quantity: number) {
    await fetch(`/api/admin/materiel-types/${containerId}/contents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_type_id: itemId, quantity }),
    });
    await loadContents(containerId, token);
  }

  async function updateQuantity(containerId: string, contentId: string, quantity: number) {
    if (quantity < 1) return;
    setChildrenByContainer((prev) => ({
      ...prev,
      [containerId]: (prev[containerId] ?? []).map((c) => (c.id === contentId ? { ...c, quantity } : c)),
    }));
    await fetch(`/api/admin/materiel-types/${containerId}/contents/${contentId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
  }

  async function updateCategory(typeId: string, containerId: string | null, categoryId: string) {
    const category = categories.find((c) => c.id === categoryId) ?? null;
    if (containerId === null) {
      setRoots((prev) => prev.map((r) => (r.id === typeId ? { ...r, category_id: categoryId || null, category } : r)));
    } else {
      setChildrenByContainer((prev) => ({
        ...prev,
        [containerId]: (prev[containerId] ?? []).map((c) =>
          c.child_type?.id === typeId ? { ...c, child_type: { ...c.child_type, category_id: categoryId || null, category } } : c
        ),
      }));
    }
    await fetch(`/api/admin/materiel-types/${typeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId || null }),
    });
  }

  async function unlink(containerId: string, contentId: string) {
    setChildrenByContainer((prev) => ({ ...prev, [containerId]: (prev[containerId] ?? []).filter((c) => c.id !== contentId) }));
    await fetch(`/api/admin/materiel-types/${containerId}/contents/${contentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async function handleAddRoot(name: string, code: string, categoryId: string) {
    const res = await fetch('/api/admin/materiel-types', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, is_container: true, category_id: categoryId || null }),
    });
    if (res.ok) {
      setAddingRoot(false);
      await fetchRoots(token);
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? "Erreur lors de l'ajout.");
    }
  }

  async function handleDeleteRoot(id: string, name: string) {
    if (!confirm(`Supprimer définitivement « ${name} » ? Son contenu (liens vers d'autres contenants ou items) sera retiré ; les types qu'il contenait ne seront pas supprimés.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/materiel-types/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      await fetchRoots(token);
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression.');
    }
  }

  // ── Localisation d'un id glissable dans l'arbre courant ──────────────

  type Location = { zoneId: string; index: number };

  function findLocation(id: string): Location | null {
    if (id === 'zone:root') return { zoneId: 'root', index: roots.length };
    if (id.startsWith('zone:')) {
      const containerId = id.slice(5);
      return { zoneId: containerId, index: (childrenByContainer[containerId] ?? []).length };
    }
    if (id.startsWith('root:')) {
      const typeId = id.slice(5);
      const idx = roots.findIndex((r) => r.id === typeId);
      return idx >= 0 ? { zoneId: 'root', index: idx } : null;
    }
    if (id.startsWith('node:')) {
      const contentId = id.slice(5);
      for (const [containerId, list] of Object.entries(childrenByContainer)) {
        const idx = list.findIndex((c) => c.id === contentId);
        if (idx >= 0) return { zoneId: containerId, index: idx };
      }
    }
    return null;
  }

  async function persistRootOrder(next: MaterielType[]) {
    await Promise.all(
      next.map((r, i) => fetch(`/api/admin/materiel-types/${r.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_order: i }),
      }))
    );
  }

  async function persistContainerOrder(containerId: string, next: MaterielTypeContent[]) {
    await Promise.all(
      next.map((c, i) => fetch(`/api/admin/materiel-types/${containerId}/contents/${c.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: i }),
      }))
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const fromLoc = findLocation(activeId);
    const toLoc = findLocation(overId);
    if (!fromLoc || !toLoc) return;

    let draggedType: MaterielType | undefined;
    let draggedContentId: string | null = null;
    let draggedQuantity = 1;

    if (activeId.startsWith('root:')) {
      draggedType = roots.find((r) => r.id === activeId.slice(5));
    } else if (activeId.startsWith('node:')) {
      const contentId = activeId.slice(5);
      const list = childrenByContainer[fromLoc.zoneId] ?? [];
      const entry = list.find((c) => c.id === contentId);
      if (entry?.child_type) {
        draggedType = entry.child_type as MaterielType;
        draggedContentId = entry.id;
        draggedQuantity = entry.quantity;
      }
    }
    if (!draggedType) return;

    // Un item (non-contenant) ne peut pas devenir un contenant racine.
    if (toLoc.zoneId === 'root' && !draggedType.is_container) return;
    // Un contenant ne peut pas se contenir lui-même.
    if (toLoc.zoneId === draggedType.id) return;

    if (fromLoc.zoneId === toLoc.zoneId) {
      if (fromLoc.index === toLoc.index) return;
      if (fromLoc.zoneId === 'root') {
        const next = arrayMove(roots, fromLoc.index, toLoc.index);
        setRoots(next);
        await persistRootOrder(next);
      } else {
        const list = childrenByContainer[fromLoc.zoneId] ?? [];
        const next = arrayMove(list, fromLoc.index, toLoc.index);
        setChildrenByContainer((prev) => ({ ...prev, [fromLoc.zoneId]: next }));
        await persistContainerOrder(fromLoc.zoneId, next);
      }
      return;
    }

    // Déplacement entre deux emplacements différents (racine <-> contenant, ou contenant <-> contenant).
    // On crée d'abord l'entrée à destination, et on ne retire l'ancienne qu'une fois ce déplacement confirmé,
    // pour éviter de perdre l'item si la destination refuse l'insertion (doublon, cycle...).
    if (toLoc.zoneId === 'root') {
      const nextRoots = roots.filter((r) => r.id !== draggedType!.id);
      nextRoots.splice(toLoc.index, 0, draggedType);
      setRoots(nextRoots);
      await persistRootOrder(nextRoots);

      if (draggedContentId) {
        await fetch(`/api/admin/materiel-types/${fromLoc.zoneId}/contents/${draggedContentId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        await loadContents(fromLoc.zoneId, token);
      }
      return;
    }

    const res = await fetch(`/api/admin/materiel-types/${toLoc.zoneId}/contents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_type_id: draggedType.id, quantity: draggedQuantity }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "Ce déplacement n'est pas possible.");
      return;
    }
    const { content: newContent } = (await res.json()) as { content: MaterielTypeContent };
    const destList = [...(childrenByContainer[toLoc.zoneId] ?? [])];
    destList.splice(toLoc.index, 0, newContent);
    setChildrenByContainer((prev) => ({ ...prev, [toLoc.zoneId]: destList }));
    await persistContainerOrder(toLoc.zoneId, destList);

    if (fromLoc.zoneId === 'root') {
      setRoots((prev) => prev.filter((r) => r.id !== draggedType!.id));
    } else if (draggedContentId) {
      await fetch(`/api/admin/materiel-types/${fromLoc.zoneId}/contents/${draggedContentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setChildrenByContainer((prev) => ({ ...prev, [fromLoc.zoneId]: (prev[fromLoc.zoneId] ?? []).filter((c) => c.id !== draggedContentId) }));
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '40vh', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#94a3b8' }}>Chargement…</p>
      </div>
    );
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Accès refusé : page réservée aux administrateurs.
      </div>
    );
  }

  const ctxValue: TreeCtxValue = {
    token,
    editMode,
    expanded,
    childrenByContainer,
    loadingContainers,
    categories,
    toggleExpand,
    addContainer,
    addItem,
    updateQuantity,
    updateCategory,
    unlink,
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Matériel
          </h1>
          <p style={{ margin: '7px 0 0', fontSize: 13.5, color: '#64748b', lineHeight: 1.5, maxWidth: 680 }}>
            Plan de rangement du matériel : créez des contenants, dépliez-les pour ajouter d&apos;autres contenants ou
            des items de la bibliothèque, et glissez-déposez pour réorganiser leur contenu, y compris entre contenants.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          style={{
            cursor: 'pointer',
            flexShrink: 0,
            border: editMode ? 'none' : '1px solid #cbd5e1',
            background: editMode ? '#059669' : '#fff',
            color: editMode ? '#fff' : '#334155',
            borderRadius: 9,
            padding: '10px 18px',
            fontSize: 13.5,
            fontWeight: 700,
            fontFamily: 'inherit',
          }}
        >
          {editMode ? 'Valider' : 'Modifier'}
        </button>
      </div>

      {error ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      ) : null}

      <TreeCtx.Provider value={ctxValue}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
          {roots.length === 0 ? (
            <DropZone id="zone:root" empty>
              <div style={{ textAlign: 'center', background: '#fff', border: '1.5px dashed #e2e8f0', borderRadius: 16, padding: '36px 24px', marginBottom: 16 }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 13.5 }}>Aucun contenant pour l&apos;instant. Créez-en un ci-dessous.</p>
              </div>
            </DropZone>
          ) : (
            <DropZone id="zone:root">
              <SortableContext items={roots.map((r) => `root:${r.id}`)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {roots.map((r) => (
                    <TreeNode
                      key={r.id}
                      sortableId={`root:${r.id}`}
                      node={r}
                      depth={0}
                      onFullDelete={() => void handleDeleteRoot(r.id, r.name)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DropZone>
          )}
        </DndContext>
      </TreeCtx.Provider>

      {editMode ? (
        addingRoot ? (
          <AddContainerForm categories={categories} onSubmit={handleAddRoot} onCancel={() => setAddingRoot(false)} />
        ) : (
          <button type="button" onClick={() => setAddingRoot(true)}
            style={{ cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 10, padding: '11px 16px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', width: '100%' }}>
            + Nouveau contenant
          </button>
        )
      ) : null}
    </div>
  );
}
