'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  PointerSensor,
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
import { Profile, MaterielType, MaterielTypeContent } from '@/lib/types';

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
      title="Glisser pour réordonner"
      style={{ flexShrink: 0, cursor: 'grab', color: '#cbd5e1', fontSize: 13, lineHeight: 1, letterSpacing: -3, touchAction: 'none', ...style }}
    >
      ⠿⠿
    </span>
  );
}

const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#0f172a', outline: 'none', fontFamily: 'inherit' };

// ── Formulaire « + Ajouter un contenant » ───────────────────────────

function AddContainerForm({ onSubmit, onCancel }: { onSubmit: (name: string, code: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit(name.trim(), code.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px dashed #cbd5e1', borderRadius: 10, padding: '9px 11px' }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du contenant" autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') onCancel(); }}
        style={{ ...inputStyle, flex: 1 }} />
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (optionnel)" maxLength={24}
        style={{ ...inputStyle, width: 140, textTransform: 'uppercase' }} />
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

// ── Nœud de l'arbre (contenant ou item) ──────────────────────────────

type TreeNodeType = Pick<MaterielType, 'id' | 'name' | 'code' | 'is_container'>;

type LinkMeta = {
  contentId: string;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onUnlink: () => void;
};

function TreeNode({ node, token, depth, meta, onFullDelete, sortableId }: {
  node: TreeNodeType;
  token: string;
  depth: number;
  meta?: LinkMeta;
  onFullDelete?: () => void;
  sortableId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [contents, setContents] = useState<MaterielTypeContent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [addMode, setAddMode] = useState<'container' | 'item' | null>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const fetchContents = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/materiel-types/${node.id}/contents`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const json = (await res.json()) as { contents: MaterielTypeContent[] };
      setContents(json.contents);
    }
    setLoading(false);
  }, [node.id, token]);

  function toggleExpand() {
    if (!expanded && contents === null) void fetchContents();
    setExpanded((v) => !v);
  }

  async function handleAddContainer(name: string, code: string) {
    const createRes = await fetch('/api/admin/materiel-types', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, is_container: true }),
    });
    if (!createRes.ok) return;
    const { type } = (await createRes.json()) as { type: MaterielType };
    await fetch(`/api/admin/materiel-types/${node.id}/contents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_type_id: type.id, quantity: 1 }),
    });
    setAddMode(null);
    await fetchContents();
  }

  async function handleAddItem(itemId: string, quantity: number) {
    await fetch(`/api/admin/materiel-types/${node.id}/contents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_type_id: itemId, quantity }),
    });
    setAddMode(null);
    await fetchContents();
  }

  async function handleUpdateQuantity(contentId: string, quantity: number) {
    if (quantity < 1) return;
    await fetch(`/api/admin/materiel-types/${node.id}/contents/${contentId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
    await fetchContents();
  }

  async function handleUnlink(contentId: string) {
    await fetch(`/api/admin/materiel-types/${node.id}/contents/${contentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchContents();
  }

  async function handleChildDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!contents || !over || active.id === over.id) return;
    const oldIndex = contents.findIndex((c) => c.id === active.id);
    const newIndex = contents.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(contents, oldIndex, newIndex);
    setContents(next);
    await Promise.all(
      next.map((c, i) => fetch(`/api/admin/materiel-types/${node.id}/contents/${c.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: i }),
      }))
    );
  }

  const existingChildIds = new Set((contents ?? []).map((c) => c.child_type_id));

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #eef1f5', borderRadius: 12, padding: '10px 12px', background: '#fcfcfd' }}>
        {meta ? <DragHandle attributes={attributes} listeners={listeners} /> : <span style={{ width: 13 }} />}
        {node.is_container ? (
          <button type="button" onClick={toggleExpand} aria-label={expanded ? 'Replier' : 'Déplier'}
            style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#64748b', fontSize: 13, padding: '2px 4px', flexShrink: 0 }}>
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span style={{ width: 19, flexShrink: 0 }} />
        )}
        <span style={{
          flexShrink: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', borderRadius: 99, padding: '2px 8px',
          color: node.is_container ? '#7c3aed' : '#64748b',
          background: node.is_container ? '#f5f3ff' : '#f1f5f9',
          border: `1px solid ${node.is_container ? '#ddd6fe' : '#e2e8f0'}`,
        }}>
          {node.is_container ? 'Contenant' : 'Item'}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: '#0f172a', cursor: node.is_container ? 'pointer' : 'default' }} onClick={node.is_container ? toggleExpand : undefined}>
          {node.name}
          {node.code ? <span style={{ marginLeft: 7, fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{node.code}</span> : null}
        </span>
        {meta ? (
          <>
            <input type="number" min={1} value={meta.quantity} onChange={(e) => meta.onQuantityChange(Number(e.target.value) || 1)}
              style={{ ...inputStyle, width: 58, textAlign: 'center', flexShrink: 0 }} />
            <button type="button" onClick={meta.onUnlink} aria-label="Retirer"
              style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#dc2626', fontSize: 15, padding: '4px 6px', flexShrink: 0 }}>✕</button>
          </>
        ) : onFullDelete ? (
          <button type="button" onClick={onFullDelete}
            style={{ cursor: 'pointer', border: '1px solid #fecaca', background: '#fff', color: '#dc2626', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}>
            Supprimer
          </button>
        ) : null}
      </div>

      {expanded && node.is_container ? (
        <div style={{ marginLeft: 30, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Chargement…</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleChildDragEnd}>
              <SortableContext items={(contents ?? []).map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(contents ?? []).length === 0 ? (
                    <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '2px' }}>Ce contenant est vide.</div>
                  ) : (contents ?? []).map((c) => (
                    c.child_type ? (
                      <TreeNode
                        key={c.id}
                        sortableId={c.id}
                        node={c.child_type}
                        token={token}
                        depth={depth + 1}
                        meta={{
                          contentId: c.id,
                          quantity: c.quantity,
                          onQuantityChange: (q) => void handleUpdateQuantity(c.id, q),
                          onUnlink: () => void handleUnlink(c.id),
                        }}
                      />
                    ) : null
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {addMode === 'container' ? (
              <AddContainerForm onSubmit={handleAddContainer} onCancel={() => setAddMode(null)} />
            ) : addMode === 'item' ? (
              <AddItemForm token={token} excludeIds={existingChildIds} onSubmit={handleAddItem} onCancel={() => setAddMode(null)} />
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
        </div>
      ) : null}
    </div>
  );
}

export default function AdminMaterielsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [roots, setRoots] = useState<MaterielType[]>([]);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const fetchRoots = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/materiel-types?kind=roots', { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) {
      const json = (await res.json()) as { types: MaterielType[] };
      setRoots(json.types);
    }
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
      setLoading(false);
    }
    void init();
  }, [router, fetchRoots]);

  async function handleAddRoot(name: string, code: string) {
    const res = await fetch('/api/admin/materiel-types', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, is_container: true }),
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

  async function handleRootDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = roots.findIndex((r) => r.id === active.id);
    const newIndex = roots.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(roots, oldIndex, newIndex);
    setRoots(next);
    await Promise.all(
      next.map((r, i) => fetch(`/api/admin/materiel-types/${r.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_order: i }),
      }))
    );
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

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Matériel
        </h1>
        <p style={{ margin: '7px 0 0', fontSize: 13.5, color: '#64748b', lineHeight: 1.5, maxWidth: 680 }}>
          Plan de rangement du matériel : créez des contenants, dépliez-les pour ajouter d&apos;autres contenants ou
          des items de la bibliothèque, et glissez-déposez pour réordonner leur contenu.
        </p>
      </div>

      {error ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      ) : null}

      {roots.length === 0 ? (
        <div style={{ textAlign: 'center', background: '#fff', border: '1.5px dashed #e2e8f0', borderRadius: 16, padding: '36px 24px', marginBottom: 16 }}>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13.5 }}>Aucun contenant pour l&apos;instant. Créez-en un ci-dessous.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRootDragEnd}>
          <SortableContext items={roots.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {roots.map((r) => (
                <TreeNode
                  key={r.id}
                  sortableId={r.id}
                  node={r}
                  token={token}
                  depth={0}
                  onFullDelete={() => void handleDeleteRoot(r.id, r.name)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {addingRoot ? (
        <AddContainerForm onSubmit={handleAddRoot} onCancel={() => setAddingRoot(false)} />
      ) : (
        <button type="button" onClick={() => setAddingRoot(true)}
          style={{ cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 10, padding: '11px 16px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', width: '100%' }}>
          + Nouveau contenant
        </button>
      )}
    </div>
  );
}
