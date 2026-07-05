'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '@/lib/supabase/client';
import { Profile, MaterielType, MaterielTypeContent, MaterielCategory } from '@/lib/types';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { materielPalette } from '@/lib/materiel-palette';
import { cn } from '@/lib/cn';

const ZITEMS = 'zitems:';
const ZSUBC = 'zsubc:';

const inputClass = 'w-full rounded-[10px] border border-line-field px-3 py-2 text-sm text-ink outline-none';

function itemsOf(list: MaterielTypeContent[]) {
  return list.filter((c) => c.child_type && !c.child_type.is_container);
}
function subsOf(list: MaterielTypeContent[]) {
  return list.filter((c) => c.child_type?.is_container);
}

// ── Poignée de glisser-déposer ───────────────────────────────────

function DragHandle({ attributes, listeners, style, size = 18 }: {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  style?: React.CSSProperties;
  size?: number;
}) {
  return (
    <span {...attributes} {...listeners} title="Glisser pour réordonner ou déplacer" className="shrink-0 cursor-grab touch-none text-ink-3" style={style}>
      <Icon name="drag_indicator" size={size} />
    </span>
  );
}

// ── Zone de dépôt (droppable pour une liste d'items ou de sous-contenants) ──

function DropZone({ id, children, empty, className }: { id: string; children: React.ReactNode; empty?: boolean; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn('rounded-[10px] transition-colors', isOver && 'bg-accent-soft/60 outline outline-2 outline-offset-2 outline-dashed outline-accent-ring', className)}
      style={{ minHeight: empty ? 36 : undefined }}
    >
      {children}
    </div>
  );
}

// ── Contexte partagé de l'arbre ───────────────────────────────────────

type TreeCtxValue = {
  token: string;
  editMode: boolean;
  categories: MaterielCategory[];
  childrenByContainer: Record<string, MaterielTypeContent[]>;
  loadingContainers: Set<string>;
  isExpanded: (id: string, depth: number) => boolean;
  toggleExpand: (id: string) => void;
  ensureLoaded: (containerId: string) => void;
  createSubContainer: (parentId: string, name: string) => Promise<boolean>;
  addItem: (containerId: string, itemId: string, quantity: number) => Promise<void>;
  updateQuantity: (containerId: string, contentId: string, quantity: number) => Promise<void>;
  updateCategory: (typeId: string, categoryId: string) => Promise<void>;
  setAvailability: (typeId: string, isAvailable: boolean, reason: string | null) => Promise<void>;
  unlink: (containerId: string, contentId: string, isContainer?: boolean) => Promise<void>;
};

const TreeCtx = createContext<TreeCtxValue | null>(null);

function useTreeCtx(): TreeCtxValue {
  const ctx = useContext(TreeCtx);
  if (!ctx) throw new Error('TreeCtx manquant');
  return ctx;
}

// ── Ligne d'item placé dans un contenant ──────────────────────────────

function ItemRow({ content, containerId }: { content: MaterielTypeContent; containerId: string }) {
  const ctx = useTreeCtx();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `it:${content.id}`,
    data: { label: content.child_type?.name },
  });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  if (!content.child_type) return null;

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 border-b border-line-row py-[7px] last:border-b-0">
      {ctx.editMode ? (
        <DragHandle attributes={attributes} listeners={listeners} size={16} />
      ) : (
        <span className="w-[26px] shrink-0 text-[12px] font-bold text-ink-3">{content.quantity}x</span>
      )}
      {ctx.editMode ? (
        <input type="number" min={1} value={content.quantity}
          onChange={(e) => void ctx.updateQuantity(containerId, content.id, Number(e.target.value) || 1)}
          className={cn(inputClass, 'w-[46px] shrink-0 px-1.5 py-1 text-center text-[12px]')} />
      ) : null}
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{content.child_type.name}</span>
      {ctx.editMode ? (
        <button type="button" onClick={() => void ctx.unlink(containerId, content.id)} aria-label="Retirer" className="shrink-0 p-1 text-bad">
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
}

// ── Recherche + glisser-déposer d'items de la bibliothèque ────────────

function LibraryResultRow({ item, containerId }: { item: MaterielType; containerId: string }) {
  // L'id inclut le contenant d'origine : le même item peut apparaître dans plusieurs
  // zones de recherche ouvertes simultanément, et dnd-kit exige des ids uniques
  // dans tout le DndContext. L'id réel de l'item voyage dans `data.itemId`.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib:${containerId}:${item.id}`,
    data: { itemId: item.id, label: item.name, sub: item.containers?.[0] },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('flex cursor-grab touch-none items-center gap-2 rounded-lg border border-line-row bg-surface-card px-2.5 py-[7px]', isDragging && 'opacity-40')}
    >
      <Icon name="drag_indicator" size={15} className="shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink">{item.name}</span>
      {item.containers && item.containers.length > 0 ? (
        <span className="shrink-0 rounded-md bg-surface-sub px-1.5 py-0.5 text-[10px] font-bold text-ink-3">{item.containers[0]}</span>
      ) : null}
    </div>
  );
}

function LibrarySearchBox({ containerId, excludeIds }: { containerId: string; excludeIds: Set<string> }) {
  const ctx = useTreeCtx();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MaterielType[]>([]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/admin/materiel-types?kind=items&q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${ctx.token}` },
      });
      if (!active || !res.ok) return;
      const json = (await res.json()) as { types: MaterielType[] };
      setResults(json.types.filter((t) => !excludeIds.has(t.id)).slice(0, 8));
    }, 200);
    return () => { active = false; clearTimeout(timer); };
    // excludeIds est recréé à chaque rendu (Set) : on ne le suit pas comme dépendance pour éviter une boucle de requêtes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ctx.token]);

  return (
    <div className="rounded-[10px] border border-line bg-surface-sub px-[11px] py-2.5">
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-line-field bg-surface-card px-2.5 py-1.5">
        <Icon name="search" size={16} className="text-ink-3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un item dans la bibliothèque…"
          className="flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      {results.length > 0 ? (
        <div className="flex flex-col gap-1">
          {results.map((item) => <LibraryResultRow key={item.id} item={item} containerId={containerId} />)}
        </div>
      ) : query.trim() ? (
        <div className="text-[11px] text-ink-3">Aucun item trouvé.</div>
      ) : (
        <p className="text-[11px] leading-snug text-ink-3">Glissez un item de la bibliothèque vers un contenant pour l&apos;y ajouter.</p>
      )}
    </div>
  );
}

// ── Tuile « + Sous-contenant » ────────────────────────────────────────

function CreateSubContainerTile({ parentId }: { parentId: string }) {
  const ctx = useTreeCtx();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const ok = await ctx.createSubContainer(parentId, name.trim());
      if (ok) {
        setName('');
        setAdding(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!adding) {
    return (
      <button type="button" onClick={() => setAdding(true)}
        className="flex w-[130px] shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-line-field p-3 text-center text-[11px] font-bold text-brand">
        + Sous-contenant
      </button>
    );
  }

  return (
    <div className="flex w-[200px] shrink-0 flex-col gap-1.5 rounded-[10px] border border-dashed border-line-field bg-surface-card p-2.5">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du sous-contenant" autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') setAdding(false); }}
        className={cn(inputClass, 'px-2 py-1.5 text-[12px]')} />
      <div className="flex gap-1.5">
        <Button variant="engage" onClick={submit} disabled={saving || !name.trim()} className="flex-1 rounded-lg px-2 py-1.5 text-[11.5px]">
          Créer
        </Button>
        <button type="button" onClick={() => setAdding(false)} aria-label="Annuler" className="p-1 text-ink-3">
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Corps d'un contenant (items + sous-contenants + recherche) ───────

function ContainerBody({ container, depth }: { container: MaterielType; depth: number }) {
  const ctx = useTreeCtx();
  const contents = ctx.childrenByContainer[container.id];
  const isLoading = ctx.loadingContainers.has(container.id);
  const items = itemsOf(contents ?? []);
  const subs = subsOf(contents ?? []);
  const existingChildIds = new Set((contents ?? []).map((c) => c.child_type_id));

  if (isLoading) {
    return <div className="py-2 text-[12.5px] text-ink-3">Chargement…</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <DropZone id={`${ZITEMS}${container.id}`} empty={items.length === 0}>
        <SortableContext items={items.map((c) => `it:${c.id}`)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col">
            {items.length === 0 ? (
              <div className="py-1 text-[12px] text-ink-3">
                {ctx.editMode ? 'Glissez un item de la bibliothèque ici.' : 'Aucun item.'}
              </div>
            ) : items.map((c) => <ItemRow key={c.id} content={c} containerId={container.id} />)}
          </div>
        </SortableContext>
      </DropZone>

      {subs.length > 0 || ctx.editMode ? (
        <div>
          <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-3">Sous-contenants</div>
          <DropZone id={`${ZSUBC}${container.id}`} empty={subs.length === 0} className="flex gap-2.5 overflow-x-auto pb-1">
            <SortableContext items={subs.map((c) => `sc:${c.id}`)} strategy={horizontalListSortingStrategy}>
              {subs.map((c) => (c.child_type ? (
                <NestedContainerNode key={c.id} contentId={c.id} parentId={container.id} node={c.child_type as MaterielType} depth={depth + 1} />
              ) : null))}
              {ctx.editMode ? <CreateSubContainerTile parentId={container.id} /> : null}
            </SortableContext>
          </DropZone>
        </div>
      ) : null}

      {ctx.editMode ? <LibrarySearchBox containerId={container.id} excludeIds={existingChildIds} /> : null}
    </div>
  );
}

// ── Sous-contenant (nœud récursif, replié au-delà du niveau 2) ───────

function NestedContainerNode({ contentId, parentId, node, depth }: {
  contentId: string;
  parentId: string;
  node: MaterielType;
  depth: number;
}) {
  const ctx = useTreeCtx();
  const expanded = ctx.isExpanded(node.id, depth);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sc:${contentId}`,
    data: { label: node.name },
  });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  useEffect(() => {
    if (expanded) ctx.ensureLoaded(node.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, node.id]);

  if (!expanded) {
    return (
      <div ref={setNodeRef} style={style} className="flex w-[150px] shrink-0 items-center gap-1 rounded-lg border border-line-row bg-surface-card px-2 py-2">
        {ctx.editMode ? <DragHandle attributes={attributes} listeners={listeners} size={14} /> : null}
        <button type="button" onClick={() => ctx.toggleExpand(node.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <Icon name="chevron_right" size={16} className="shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-ink-2">{node.name}</span>
          <span className="shrink-0 text-[10px] font-bold text-ink-3">{node.content_count ?? 0} él.</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="w-[210px] shrink-0 rounded-[10px] border border-line-row bg-surface-sub p-[9px]">
      <div className="mb-2 flex items-center gap-1.5">
        {ctx.editMode ? <DragHandle attributes={attributes} listeners={listeners} size={15} /> : null}
        <button type="button" onClick={() => ctx.toggleExpand(node.id)} className="shrink-0 text-ink-3">
          <Icon name="expand_more" size={16} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-ink">{node.name}</span>
        {ctx.editMode ? (
          <button type="button" onClick={() => void ctx.unlink(parentId, contentId, true)} aria-label="Retirer" className="shrink-0 p-0.5 text-bad">
            <Icon name="close" size={15} />
          </button>
        ) : null}
      </div>
      <ContainerBody container={node} depth={depth} />
    </div>
  );
}

// ── Carte d'un contenant racine (bandeau coloré + disponibilité) ─────

function RootContainerCard({ node, onFullDelete }: { node: MaterielType; onFullDelete: () => void }) {
  const ctx = useTreeCtx();
  const expanded = ctx.isExpanded(node.id, 0);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `root:${node.id}`,
    data: { label: node.name },
  });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [reasonDraft, setReasonDraft] = useState(node.unavailable_reason ?? '');
  const p = materielPalette(node.category?.color);

  useEffect(() => {
    if (expanded) ctx.ensureLoaded(node.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, node.id]);

  return (
    <div ref={setNodeRef} style={style} className="mb-2.5 overflow-hidden rounded-xl border border-line bg-surface-card">
      <div className="flex items-center gap-2.5 px-3.5 py-3" style={{ background: p.accent }}>
        {ctx.editMode ? <DragHandle attributes={attributes} listeners={listeners} style={{ color: 'rgba(255,255,255,.65)' }} /> : null}
        <button type="button" onClick={() => ctx.toggleExpand(node.id)} className="shrink-0 text-white">
          <Icon name={expanded ? 'expand_more' : 'chevron_right'} size={20} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[15px] font-black tracking-tight text-white">{node.name}</span>
        {!ctx.editMode && !node.is_available ? (
          <span className="shrink-0 rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white">Indisponible</span>
        ) : null}
        {ctx.editMode ? (
          <select
            value={node.category_id ?? ''}
            onChange={(e) => void ctx.updateCategory(node.id, e.target.value)}
            className="shrink-0 rounded-lg border border-white/35 bg-white/10 px-2 py-1.5 text-xs font-bold text-white"
          >
            <option value="" className="text-ink">Type…</option>
            {ctx.categories.map((c) => <option key={c.id} value={c.id} className="text-ink">{c.name}</option>)}
          </select>
        ) : node.category ? (
          <span className="shrink-0 text-xs font-bold text-white/80">{node.category.name}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-b border-line-row bg-surface-sub/60 px-3.5 py-2.5">
        <Toggle
          value={node.is_available}
          disabled={!ctx.editMode}
          onChange={(v) => { if (v) setReasonDraft(''); void ctx.setAvailability(node.id, v, v ? null : reasonDraft || null); }}
        />
        <span className={cn('text-[12.5px] font-bold', node.is_available ? 'text-engage' : 'text-bad')}>
          {node.is_available ? 'Disponible' : 'Indisponible'}
        </span>
        {ctx.editMode && !node.is_available ? (
          <input
            value={reasonDraft}
            onChange={(e) => setReasonDraft(e.target.value)}
            onBlur={() => void ctx.setAvailability(node.id, false, reasonDraft || null)}
            placeholder="Motif (optionnel) : panne, maintenance…"
            className={cn(inputClass, 'min-w-[160px] flex-1 px-2.5 py-[6px] text-[12px]')}
          />
        ) : !node.is_available && node.unavailable_reason ? (
          <span className="text-[11.5px] text-ink-3">— {node.unavailable_reason}</span>
        ) : node.is_available ? (
          <span className="text-[11.5px] text-ink-3">— une mission peut réclamer ce type en quantité.</span>
        ) : null}
        {ctx.editMode ? (
          <button type="button" onClick={onFullDelete} className="ml-auto shrink-0 text-xs font-bold text-bad">
            Supprimer
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="p-3.5">
          <ContainerBody container={node} depth={0} />
        </div>
      ) : null}
    </div>
  );
}

// ── Formulaire « Créer un contenant » (racine, en bas de page) ───────

function CreateRootContainerForm({ categories, onSubmit }: {
  categories: MaterielCategory[];
  onSubmit: (name: string, categoryId: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit(name.trim(), categoryId);
      setName('');
      setCategoryId('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[10px] border-[1.5px] border-dashed border-line-field bg-surface-sub px-3.5 py-3">
      <div className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-3">Créer un contenant</div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du contenant"
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          className={cn(inputClass, 'min-w-[160px] flex-1')} />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={cn(inputClass, 'w-[190px]')}>
          <option value="">Type (si autonome)…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button variant="engage" onClick={submit} disabled={saving || !name.trim()} className="shrink-0 rounded-lg px-4 py-2 text-[12.5px]">
          Créer
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
        Le type n&apos;est utile que si ce contenant reste autonome (non placé dans un autre) — sinon laissez-le vide, il pourra être glissé dans un contenant existant.
      </p>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────

type Location = { zoneId: string; index: number };

export default function AdminMaterielsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [roots, setRoots] = useState<MaterielType[]>([]);
  const [childrenByContainer, setChildrenByContainer] = useState<Record<string, MaterielTypeContent[]>>({});
  // État de dépli, gardé indépendamment de la profondeur affichée : un contenant peut changer
  // de profondeur (promu/rétrogradé racine, ou re-parenté) sans que son état de dépli explicite
  // soit réinterprété. `expandedIdsRef` porte l'état réel ; `initializedIdsRef` mémorise les ids
  // déjà initialisés avec le défaut (déplié si profondeur < 2) pour ne l'appliquer qu'une fois.
  const expandedIdsRef = useRef<Set<string>>(new Set());
  const initializedIdsRef = useRef<Set<string>>(new Set());
  const [, forceRerender] = useState(0);
  const [loadingContainers, setLoadingContainers] = useState<Set<string>>(new Set());
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [categories, setCategories] = useState<MaterielCategory[]>([]);
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);
  const [activeDragSub, setActiveDragSub] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const fetchRoots = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/materiel-types?kind=roots', { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) {
      const json = (await res.json()) as { types: MaterielType[] };
      setRoots(json.types);
    }
  }, []);

  const loadContents = useCallback(async (containerId: string, tok: string): Promise<MaterielTypeContent[]> => {
    setLoadingContainers((prev) => new Set(prev).add(containerId));
    const res = await fetch(`/api/admin/materiel-types/${containerId}/contents`, { headers: { Authorization: `Bearer ${tok}` } });
    let contents: MaterielTypeContent[] = [];
    if (res.ok) {
      const json = (await res.json()) as { contents: MaterielTypeContent[] };
      contents = json.contents;
      setChildrenByContainer((prev) => ({ ...prev, [containerId]: contents }));
    }
    setLoadingContainers((prev) => { const next = new Set(prev); next.delete(containerId); return next; });
    return contents;
  }, []);

  const childrenRef = useRef(childrenByContainer);
  childrenRef.current = childrenByContainer;
  const loadingRef = useRef(loadingContainers);
  loadingRef.current = loadingContainers;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const ensureLoaded = useCallback((containerId: string) => {
    if (childrenRef.current[containerId] === undefined && !loadingRef.current.has(containerId)) {
      void loadContents(containerId, tokenRef.current);
    }
  }, [loadContents]);

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

  function isExpanded(id: string, depth: number) {
    if (!initializedIdsRef.current.has(id)) {
      initializedIdsRef.current.add(id);
      if (depth < 2) expandedIdsRef.current.add(id);
    }
    return expandedIdsRef.current.has(id);
  }
  function toggleExpand(id: string) {
    initializedIdsRef.current.add(id);
    if (expandedIdsRef.current.has(id)) expandedIdsRef.current.delete(id); else expandedIdsRef.current.add(id);
    forceRerender((n) => n + 1);
  }

  async function createSubContainer(parentId: string, name: string): Promise<boolean> {
    const createRes = await fetch('/api/admin/materiel-types', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, is_container: true }),
    });
    if (!createRes.ok) {
      const json = (await createRes.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "Erreur lors de la création du sous-contenant.");
      return false;
    }
    const { type } = (await createRes.json()) as { type: MaterielType };
    const linkRes = await fetch(`/api/admin/materiel-types/${parentId}/contents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_type_id: type.id, quantity: 1 }),
    });
    if (!linkRes.ok) {
      const json = (await linkRes.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "Erreur lors du rattachement du sous-contenant.");
      return false;
    }
    await loadContents(parentId, token);
    return true;
  }

  async function addItem(containerId: string, itemId: string, quantity: number) {
    const res = await fetch(`/api/admin/materiel-types/${containerId}/contents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_type_id: itemId, quantity }),
    });
    if (res.ok) {
      await loadContents(containerId, token);
    } else {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "Cet ajout n'est pas possible.");
    }
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

  async function updateCategory(typeId: string, categoryId: string) {
    const category = categories.find((c) => c.id === categoryId) ?? null;
    setRoots((prev) => prev.map((r) => (r.id === typeId ? { ...r, category_id: categoryId || null, category } : r)));
    await fetch(`/api/admin/materiel-types/${typeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId || null }),
    });
  }

  async function unlink(containerId: string, contentId: string, isContainer = false) {
    setChildrenByContainer((prev) => ({ ...prev, [containerId]: (prev[containerId] ?? []).filter((c) => c.id !== contentId) }));
    await fetch(`/api/admin/materiel-types/${containerId}/contents/${contentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    // Un contenant détaché redevient potentiellement un contenant racine (un item ne le peut jamais).
    if (isContainer) await fetchRoots(token);
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

  async function createRootContainer(name: string, categoryId: string) {
    const res = await fetch('/api/admin/materiel-types', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, is_container: true, category_id: categoryId || null }),
    });
    if (res.ok) {
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

  function findLocation(id: string): Location | null {
    if (id === 'zroot') return { zoneId: 'zroot', index: roots.length };
    if (id.startsWith('root:')) {
      const idx = roots.findIndex((r) => r.id === id.slice(5));
      return idx >= 0 ? { zoneId: 'zroot', index: idx } : null;
    }
    if (id.startsWith(ZITEMS)) {
      const containerId = id.slice(ZITEMS.length);
      return { zoneId: id, index: itemsOf(childrenByContainer[containerId] ?? []).length };
    }
    if (id.startsWith(ZSUBC)) {
      const containerId = id.slice(ZSUBC.length);
      return { zoneId: id, index: subsOf(childrenByContainer[containerId] ?? []).length };
    }
    if (id.startsWith('it:')) {
      const contentId = id.slice(3);
      for (const [containerId, list] of Object.entries(childrenByContainer)) {
        const idx = itemsOf(list).findIndex((c) => c.id === contentId);
        if (idx >= 0) return { zoneId: `${ZITEMS}${containerId}`, index: idx };
      }
    }
    if (id.startsWith('sc:')) {
      const contentId = id.slice(3);
      for (const [containerId, list] of Object.entries(childrenByContainer)) {
        const idx = subsOf(list).findIndex((c) => c.id === contentId);
        if (idx >= 0) return { zoneId: `${ZSUBC}${containerId}`, index: idx };
      }
    }
    return null;
  }

  async function persistPositions(containerId: string, orderedContentIds: string[]) {
    await Promise.all(
      orderedContentIds.map((id, i) => fetch(`/api/admin/materiel-types/${containerId}/contents/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: i }),
      }))
    );
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

  async function moveItem(fromLoc: Location, toLoc: Location, contentId: string) {
    const fromContainerId = fromLoc.zoneId.slice(ZITEMS.length);
    const toContainerId = toLoc.zoneId.slice(ZITEMS.length);

    if (fromContainerId === toContainerId) {
      if (fromLoc.index === toLoc.index) return;
      const list = childrenByContainer[fromContainerId] ?? [];
      const kindList = itemsOf(list);
      const others = list.filter((c) => !kindList.includes(c));
      const reordered = arrayMove(kindList, fromLoc.index, toLoc.index);
      setChildrenByContainer((prev) => ({ ...prev, [fromContainerId]: [...reordered, ...others] }));
      await persistPositions(fromContainerId, reordered.map((c) => c.id));
      return;
    }

    const fromList = childrenByContainer[fromContainerId] ?? [];
    const entry = itemsOf(fromList)[fromLoc.index];
    if (!entry || !entry.child_type) return;

    const res = await fetch(`/api/admin/materiel-types/${toContainerId}/contents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_type_id: entry.child_type.id, quantity: entry.quantity }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "Ce déplacement n'est pas possible.");
      return;
    }
    const { content: newContent } = (await res.json()) as { content: MaterielTypeContent };

    const toList = childrenByContainer[toContainerId] ?? [];
    const toKind = itemsOf(toList);
    const toOthers = toList.filter((c) => !toKind.includes(c));
    toKind.splice(toLoc.index, 0, newContent);
    setChildrenByContainer((prev) => ({
      ...prev,
      [fromContainerId]: fromList.filter((c) => c.id !== contentId),
      [toContainerId]: [...toKind, ...toOthers],
    }));
    await persistPositions(toContainerId, toKind.map((c) => c.id));
    await fetch(`/api/admin/materiel-types/${fromContainerId}/contents/${contentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async function moveContainer(fromLoc: Location, toLoc: Location, draggedType: MaterielType, contentId: string | null) {
    if (fromLoc.zoneId === toLoc.zoneId) {
      if (fromLoc.index === toLoc.index) return;
      if (fromLoc.zoneId === 'zroot') {
        const next = arrayMove(roots, fromLoc.index, toLoc.index);
        setRoots(next);
        await persistRootOrder(next);
      } else {
        const containerId = fromLoc.zoneId.slice(ZSUBC.length);
        const list = childrenByContainer[containerId] ?? [];
        const kindList = subsOf(list);
        const others = list.filter((c) => !kindList.includes(c));
        const reordered = arrayMove(kindList, fromLoc.index, toLoc.index);
        setChildrenByContainer((prev) => ({ ...prev, [containerId]: [...reordered, ...others] }));
        await persistPositions(containerId, reordered.map((c) => c.id));
      }
      return;
    }

    // Déplacement entre deux emplacements différents (racine <-> contenant, ou contenant <-> contenant).
    if (toLoc.zoneId === 'zroot') {
      const nextRoots = [...roots];
      nextRoots.splice(toLoc.index, 0, draggedType);
      setRoots(nextRoots);
      await persistRootOrder(nextRoots);
      // Recharge depuis le serveur : l'objet glissé (venant du contenu d'un contenant) n'a
      // pas is_available/unavailable_reason, absents de cet embed — sans ce recharge, la
      // carte racine promue afficherait "Indisponible" par défaut jusqu'au prochain rechargement.
      await fetchRoots(token);
    } else {
      const toContainerId = toLoc.zoneId.slice(ZSUBC.length);
      const res = await fetch(`/api/admin/materiel-types/${toContainerId}/contents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ child_type_id: draggedType.id, quantity: 1 }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "Ce déplacement n'est pas possible.");
        return;
      }
      // Recharge plutôt que d'utiliser la réponse du POST : cette dernière n'inclut pas
      // content_count, calculé uniquement par le GET, et resterait "0 él." affiché à tort
      // si le contenant déplacé n'était pas vide.
      const freshList = await loadContents(toContainerId, token);
      const freshKind = subsOf(freshList);
      const freshOthers = freshList.filter((c) => !freshKind.includes(c));
      const movedIdx = freshKind.findIndex((c) => c.child_type_id === draggedType.id);
      if (movedIdx >= 0) {
        const [movedEntry] = freshKind.splice(movedIdx, 1);
        freshKind.splice(toLoc.index, 0, movedEntry);
        setChildrenByContainer((prev) => ({ ...prev, [toContainerId]: [...freshKind, ...freshOthers] }));
        await persistPositions(toContainerId, freshKind.map((c) => c.id));
      }
    }

    if (fromLoc.zoneId === 'zroot') {
      setRoots((prev) => prev.filter((r) => r.id !== draggedType.id));
    } else if (contentId) {
      const fromContainerId = fromLoc.zoneId.slice(ZSUBC.length);
      setChildrenByContainer((prev) => ({ ...prev, [fromContainerId]: (prev[fromContainerId] ?? []).filter((c) => c.id !== contentId) }));
      await fetch(`/api/admin/materiel-types/${fromContainerId}/contents/${contentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { label?: string; sub?: string } | undefined;
    setActiveDragLabel(data?.label ?? null);
    setActiveDragSub(data?.sub ?? null);
  }

  function handleDragCancel(_event: DragCancelEvent) {
    setActiveDragLabel(null);
    setActiveDragSub(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragLabel(null);
    setActiveDragSub(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    // Glisser un item de la bibliothèque vers une zone d'items → nouveau lien.
    // L'id du draggable inclut le contenant d'origine de la recherche (pour rester unique
    // si le même item apparaît dans plusieurs zones de recherche ouvertes) : l'id réel de
    // l'item voyage dans `data.itemId`, pas dans l'id du draggable lui-même.
    if (activeId.startsWith('lib:')) {
      const itemId = (active.data.current as { itemId?: string } | undefined)?.itemId;
      const toLoc = findLocation(overId);
      if (!itemId || !toLoc || !toLoc.zoneId.startsWith(ZITEMS)) return;
      const containerId = toLoc.zoneId.slice(ZITEMS.length);
      await addItem(containerId, itemId, 1);
      return;
    }

    const fromLoc = findLocation(activeId);
    const toLoc = findLocation(overId);
    if (!fromLoc || !toLoc) return;
    if (fromLoc.zoneId === toLoc.zoneId && fromLoc.index === toLoc.index) return;

    if (activeId.startsWith('it:')) {
      if (!toLoc.zoneId.startsWith(ZITEMS)) return;
      await moveItem(fromLoc, toLoc, activeId.slice(3));
      return;
    }

    if (activeId.startsWith('root:') || activeId.startsWith('sc:')) {
      if (!(toLoc.zoneId === 'zroot' || toLoc.zoneId.startsWith(ZSUBC))) return;
      const isRoot = activeId.startsWith('root:');
      const contentId = isRoot ? null : activeId.slice(3);
      const draggedType = isRoot
        ? roots.find((r) => r.id === activeId.slice(5))
        : (subsOf(childrenByContainer[fromLoc.zoneId.slice(ZSUBC.length)] ?? []).find((c) => c.id === contentId)?.child_type as MaterielType | undefined);
      if (!draggedType) return;
      if (toLoc.zoneId === `${ZSUBC}${draggedType.id}`) return; // un contenant ne peut pas se contenir lui-même
      await moveContainer(fromLoc, toLoc, draggedType, contentId);
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
    categories,
    childrenByContainer,
    loadingContainers,
    isExpanded,
    toggleExpand,
    ensureLoaded,
    createSubContainer,
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
        subtitle="Plan de rangement : dépliez un contenant pour ajouter d'autres contenants ou des items de la bibliothèque. Glissez pour réorganiser, y compris entre contenants."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-ink-2">Édition</span>
            <Toggle value={editMode} onChange={setEditMode} label="Mode édition" />
          </div>
        }
      />

      {editMode ? (
        <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-[#FBD9BE] bg-[#FFF3E9] px-3 py-2.5 text-xs font-bold text-[#B4590F]">
          <Icon name="drag_indicator" size={17} />
          Mode édition actif — glissez pour réorganiser, y compris entre niveaux. Validez pour repasser en lecture.
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3 text-[13px] text-bad">
          {error}
        </div>
      ) : null}

      <TreeCtx.Provider value={ctxValue}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={(e) => void handleDragEnd(e)}
          onDragCancel={handleDragCancel}
        >
          {roots.length === 0 ? (
            <DropZone id="zroot" empty>
              <div className="mb-4 rounded-2xl border-[1.5px] border-dashed border-line bg-surface-card px-6 py-9 text-center">
                <p className="text-[13.5px] text-ink-3">Aucun contenant pour l&apos;instant. Créez-en un ci-dessous.</p>
              </div>
            </DropZone>
          ) : (
            <DropZone id="zroot">
              <SortableContext items={roots.map((r) => `root:${r.id}`)} strategy={verticalListSortingStrategy}>
                <div className="mb-4 flex flex-col">
                  {roots.map((r) => (
                    <RootContainerCard key={r.id} node={r} onFullDelete={() => void handleDeleteRoot(r.id, r.name)} />
                  ))}
                </div>
              </SortableContext>
            </DropZone>
          )}

          <DragOverlay>
            {activeDragLabel ? (
              <div className="flex items-center gap-2 rounded-lg border border-line-field bg-surface-card px-2.5 py-2 shadow-lift" style={{ transform: 'rotate(-2deg)' }}>
                <Icon name="drag_indicator" size={16} className="text-ink-3" />
                <span className="text-[12.5px] font-bold text-ink">{activeDragLabel}</span>
                {activeDragSub ? <span className="rounded-md bg-surface-sub px-1.5 py-0.5 text-[10px] font-bold text-ink-3">{activeDragSub}</span> : null}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </TreeCtx.Provider>

      {editMode ? <CreateRootContainerForm categories={categories} onSubmit={createRootContainer} /> : null}

      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-3">
        Un « contenant racine » n&apos;est pas un type à part : c&apos;est simplement un contenant qui n&apos;est placé dans aucun autre — d&apos;où le type et la disponibilité en tête de carte, propres à ce cas.
        Au-delà du niveau 2, un contenant s&apos;affiche replié avec son compteur. En édition, tout est glisser-déposer : items de la bibliothèque, items déjà placés, sous-contenants — aucun bouton « Ajouter ».
      </p>
    </div>
  );
}
