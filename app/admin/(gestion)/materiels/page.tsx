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
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/cn';

const CATEGORY_PALETTE: Record<string, string> = {
  slate: '#5B6478', amber: '#B4590F', sky: '#1E3C87', violet: '#7A2E86', emerald: '#0B6E63',
  pink: '#8E1279', rose: '#D14343', orange: '#B4590F', cyan: '#0B6E63', indigo: '#1E3C87',
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
      className="shrink-0 cursor-grab touch-none"
      style={style}
    >
      <Icon name="drag_indicator" className="text-ink-3" />
    </span>
  );
}

const inputClass = 'w-full rounded-[10px] border border-line-field px-3 py-2 text-sm text-ink outline-none';

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
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-line-field px-[11px] py-[9px]">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du contenant" autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') onCancel(); }}
        className={cn(inputClass, 'min-w-[120px] flex-1')} />
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (optionnel)" maxLength={24}
        className={cn(inputClass, 'w-[140px] uppercase')} />
      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={cn(inputClass, 'w-[160px]')}>
        <option value="">Type…</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <Button variant="engage" onClick={submit} disabled={saving || !name.trim()}
        className="shrink-0 rounded-lg px-3.5 py-2 text-[12.5px]">
        Ajouter
      </Button>
      <button type="button" onClick={onCancel} aria-label="Annuler"
        className="shrink-0 p-1 text-ink-3"><Icon name="close" size={18} /></button>
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
    <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-line-field px-[11px] py-2.5">
      {selected ? (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[13.5px] font-bold text-ink">{selected.name}</span>
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 1)}
            className={cn(inputClass, 'w-16 text-center')} />
          <Button variant="engage" onClick={submit} disabled={saving}
            className="shrink-0 rounded-lg px-3.5 py-2 text-[12.5px]">
            Ajouter
          </Button>
          <button type="button" onClick={() => setSelected(null)} aria-label="Changer"
            className="shrink-0 p-1 text-ink-3"><Icon name="close" size={18} /></button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un item de la bibliothèque…" autoFocus
              className={cn(inputClass, 'flex-1')} />
            <button type="button" onClick={onCancel} aria-label="Annuler"
              className="shrink-0 p-1 text-ink-3"><Icon name="close" size={18} /></button>
          </div>
          {results.length > 0 ? (
            <div className="flex max-h-[180px] flex-col gap-1 overflow-y-auto">
              {results.map((t) => (
                <button key={t.id} type="button" onClick={() => setSelected(t)}
                  className="rounded-lg border border-line-row bg-surface-card px-2.5 py-[7px] text-left text-[13px] text-ink">
                  {t.name}{t.code ? <span className="text-ink-3"> · {t.code}</span> : null}
                </button>
              ))}
            </div>
          ) : query.trim() ? (
            <div className="text-xs text-ink-3">Aucun item trouvé.</div>
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
  setAvailability: (typeId: string, isAvailable: boolean, reason: string | null) => Promise<void>;
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
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-[10px] transition-colors',
        isOver && 'bg-accent-soft outline outline-2 outline-offset-2 outline-dashed outline-accent-ring'
      )}
      style={{ minHeight: empty ? 40 : undefined }}
    >
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
  const [reasonDraft, setReasonDraft] = useState(node.unavailable_reason ?? '');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });

  const isExpanded = ctx.expanded.has(node.id);
  const isLoading = ctx.loadingContainers.has(node.id);
  const contents = ctx.childrenByContainer[node.id];
  const existingChildIds = new Set((contents ?? []).map((c) => c.child_type_id));
  // La disponibilité ne s'édite que sur les contenants racines (unités engageables) :
  // ce sont eux qui portent is_available (chargés via ?kind=roots, donc `!meta`).
  const isRootContainer = node.is_container && !meta;

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}>
      <div className={cn(
        'flex items-center gap-[9px]',
        node.is_container
          ? 'rounded-xl border border-line-row bg-surface-sub px-3 py-2.5'
          : 'border-b border-line-row px-1 py-[7px]'
      )}>
        {ctx.editMode ? <DragHandle attributes={attributes} listeners={listeners} /> : null}
        {meta && !ctx.editMode ? (
          <span className="min-w-[22px] shrink-0 text-[12.5px] font-bold text-ink-3">{meta.quantity}x</span>
        ) : null}
        <span
          className={cn(
            'min-w-0 flex-1 text-sm',
            node.is_container ? 'cursor-pointer font-bold text-ink' : 'font-medium text-ink-2'
          )}
          onClick={node.is_container ? () => ctx.toggleExpand(node.id) : undefined}
        >
          {node.name}
          {node.code ? <span className="ml-[7px] text-xs font-semibold text-ink-3">{node.code}</span> : null}
        </span>
        {node.is_container && !ctx.editMode && node.category ? (
          <span title={node.category.name} className="inline-flex shrink-0 items-center gap-[5px] text-[11.5px] font-bold text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: categoryDot(node.category.color) }} />
            {node.category.name}
          </span>
        ) : null}
        {isRootContainer && !ctx.editMode && !node.is_available ? (
          <span title={node.unavailable_reason || 'Indisponible'} className="inline-flex shrink-0">
            <Badge tone="bad">Indisponible</Badge>
          </span>
        ) : null}
        {node.is_container && ctx.editMode ? (
          <select
            value={node.category_id ?? ''}
            onChange={(e) => void ctx.updateCategory(node.id, meta?.parentContainerId ?? null, e.target.value)}
            className={cn(inputClass, 'w-[140px] shrink-0')}
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
                className={cn(inputClass, 'w-[58px] shrink-0 text-center')} />
            ) : null}
            {ctx.editMode ? (
              <button type="button" onClick={() => void ctx.unlink(meta.parentContainerId, meta.contentId)} aria-label="Retirer"
                className="shrink-0 p-1 text-bad"><Icon name="close" size={18} /></button>
            ) : null}
          </>
        ) : onFullDelete && ctx.editMode ? (
          <Button variant="ghost" onClick={onFullDelete}
            className="shrink-0 rounded-[7px] border-bad/30 px-2.5 py-[5px] text-xs text-bad">
            Supprimer
          </Button>
        ) : null}
      </div>

      {isRootContainer && ctx.editMode ? (
        <div className="mt-2 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-dashed border-line bg-surface-card px-3 py-2">
          <Toggle
            value={node.is_available}
            onChange={(v) => {
              if (v) setReasonDraft('');
              void ctx.setAvailability(node.id, v, v ? null : reasonDraft || null);
            }}
          />
          <span className={cn('text-[12.5px] font-bold', node.is_available ? 'text-engage' : 'text-bad')}>
            {node.is_available ? 'Disponible' : 'Indisponible'}
          </span>
          {!node.is_available ? (
            <input
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              onBlur={() => void ctx.setAvailability(node.id, false, reasonDraft || null)}
              placeholder="Motif (optionnel) : panne, maintenance…"
              className={cn(inputClass, 'min-w-[160px] flex-1 px-2.5 py-[7px] text-[12.5px]')}
            />
          ) : null}
        </div>
      ) : null}

      {isExpanded && node.is_container ? (
        <div className="ml-[30px] mt-2 flex flex-col gap-2">
          {isLoading ? (
            <div className="text-[12.5px] text-ink-3">Chargement…</div>
          ) : (
            <DropZone id={`zone:${node.id}`} empty={(contents ?? []).length === 0}>
              <SortableContext items={(contents ?? []).map((c) => `node:${c.id}`)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {(contents ?? []).length === 0 ? (
                    <div className="p-0.5 text-[12.5px] text-ink-3">
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
            <div className="flex flex-col gap-2">
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
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAddMode('container')}
                    className="flex-1 rounded-[9px] border border-dashed border-line-field bg-surface-card px-3 py-2 text-[12.5px] font-bold text-brand">
                    + Ajouter un contenant
                  </button>
                  <button type="button" onClick={() => setAddMode('item')}
                    className="flex-1 rounded-[9px] border border-dashed border-line-field bg-surface-card px-3 py-2 text-[12.5px] font-bold text-brand">
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

  async function setAvailability(typeId: string, isAvailable: boolean, reason: string | null) {
    const nextReason = isAvailable ? null : reason;
    setRoots((prev) => prev.map((r) => (r.id === typeId ? { ...r, is_available: isAvailable, unavailable_reason: nextReason } : r)));
    await fetch(`/api/admin/materiel-types/${typeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_available: isAvailable, unavailable_reason: nextReason }),
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
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-ink-3">Chargement…</p>
      </div>
    );
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="rounded-lg border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
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
    setAvailability,
    unlink,
  };

  return (
    <div className="pb-20">
      <PageHeader
        title="Matériel"
        subtitle="Plan de rangement du matériel : créez des contenants, dépliez-les pour ajouter d'autres contenants ou des items de la bibliothèque, et glissez-déposez pour réorganiser leur contenu, y compris entre contenants."
        actions={
          <Button
            variant={editMode ? 'engage' : 'ghost'}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? 'Valider' : 'Modifier'}
          </Button>
        }
      />

      {error ? (
        <div className="mb-4 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3 text-[13px] text-bad">
          {error}
        </div>
      ) : null}

      <TreeCtx.Provider value={ctxValue}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
          {roots.length === 0 ? (
            <DropZone id="zone:root" empty>
              <div className="mb-4 rounded-2xl border-[1.5px] border-dashed border-line bg-surface-card px-6 py-9 text-center">
                <p className="text-[13.5px] text-ink-3">Aucun contenant pour l&apos;instant. Créez-en un ci-dessous.</p>
              </div>
            </DropZone>
          ) : (
            <DropZone id="zone:root">
              <SortableContext items={roots.map((r) => `root:${r.id}`)} strategy={verticalListSortingStrategy}>
                <div className="mb-4 flex flex-col gap-2">
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
            className="w-full rounded-[10px] border border-dashed border-line-field bg-surface-card px-4 py-[11px] text-[13.5px] font-bold text-brand">
            + Nouveau contenant
          </button>
        )
      ) : null}
    </div>
  );
}
